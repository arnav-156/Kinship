import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type {
  ConsentStatus,
  PolicyPurpose,
  Prisma,
  PrismaClient,
  RecipientType,
  SourceType,
  WorkspaceRole,
} from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import {
  parseConnectorSyncJobPayload,
  QueueName,
  type ConnectorSyncJobPayload,
} from "@relationship/queue";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { TokenService } from "../auth/token.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type {
  AcceptWorkspaceInvitationDto,
  CreateConnectorAccountDto,
  InviteWorkspaceMemberDto,
  SyncConnectorDto,
  UpdateConnectorAccountDto,
  UpdateWorkspaceMemberDto,
  UpdateWorkspacePolicyDto,
  WorkspaceRoleInput,
} from "./dto";

const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;
const connectorSyncProviders = new Set<ConnectorSyncJobPayload["provider"]>([
  "company_website",
  "crossref",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
]);
const backgroundJobStatusSelect = {
  attempts: true,
  createdAt: true,
  failureReason: true,
  id: true,
  jobName: true,
  maxAttempts: true,
  progress: true,
  queueName: true,
  status: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async listMembers(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    const [members, invitations] = await Promise.all([
      this.prisma.workspaceMembership.findMany({
        include: {
          user: {
            select: {
              createdAt: true,
              displayName: true,
              email: true,
              id: true,
              lastLoginAt: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        where: { tenantId: principal.tenantId, workspaceId },
      }),
      this.prisma.workspaceInvitation.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          email: true,
          expiresAt: true,
          id: true,
          role: true,
        },
        where: {
          acceptedAt: null,
          expiresAt: { gt: new Date() },
          revokedAt: null,
          tenantId: principal.tenantId,
          workspaceId,
        },
      }),
    ]);
    return { invitations, members };
  }

  async inviteMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    input: InviteWorkspaceMemberDto,
  ) {
    const principalRole = this.assertCanManage(principal, workspaceId);
    this.assertCanAssignRole(principalRole, input.role);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { tenantId_email: { email, tenantId: principal.tenantId } },
    });

    if (existingUser?.status === "disabled" && existingUser.deletedAt === null) {
      throw new ConflictException("This account is disabled and cannot be invited");
    }
    if (existingUser?.status === "active" && existingUser.deletedAt === null) {
      const existingMembership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { userId: existingUser.id, workspaceId } },
      });
      if (existingMembership) {
        throw new ConflictException("This user is already a workspace member");
      }

      return this.prisma.$transaction(async (tx) => {
        const membership = await tx.workspaceMembership.create({
          data: {
            role: input.role as WorkspaceRole,
            tenantId: principal.tenantId,
            userId: existingUser.id,
            workspaceId,
          },
          include: { user: true },
        });
        await this.auditService.record(
          {
            actorUserId: principal.userId,
            eventType: "workspace_member.added",
            metadata: { email, role: input.role },
            subjectId: membership.id,
            subjectType: "workspace_membership",
            tenantId: principal.tenantId,
            workspaceId,
          },
          tx,
        );
        return { kind: "member" as const, member: membership };
      });
    }

    const inviteToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = hashToken(inviteToken);
    const expiresAt = new Date(Date.now() + invitationTtlMs);
    const pending = await this.prisma.workspaceInvitation.findFirst({
      where: {
        acceptedAt: null,
        email,
        revokedAt: null,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const invitation = pending
        ? await tx.workspaceInvitation.update({
            data: {
              expiresAt,
              invitedById: principal.userId,
              role: input.role as WorkspaceRole,
              tokenHash,
            },
            where: { id: pending.id },
          })
        : await tx.workspaceInvitation.create({
            data: {
              email,
              expiresAt,
              invitedById: principal.userId,
              role: input.role as WorkspaceRole,
              tenantId: principal.tenantId,
              tokenHash,
              workspaceId,
            },
          });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: pending ? "workspace_invitation.renewed" : "workspace_invitation.created",
          metadata: { email, expiresAt: expiresAt.toISOString(), role: input.role },
          subjectId: invitation.id,
          subjectType: "workspace_invitation",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return {
        invitation: toInvitationSummary(invitation),
        inviteToken,
        kind: "invitation" as const,
      };
    });
  }

  async updateMember(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    membershipId: string,
    input: UpdateWorkspaceMemberDto,
  ) {
    const principalRole = this.assertCanManage(principal, workspaceId);
    const membership = await this.requireMembership(principal.tenantId, workspaceId, membershipId);
    this.assertCanChangeRole(principalRole, membership.role, input.role);
    if (membership.role === "owner" && input.role !== "owner") {
      await this.assertAnotherOwner(principal.tenantId, workspaceId, membership.id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workspaceMembership.update({
        data: { role: input.role as WorkspaceRole },
        include: { user: true },
        where: { id: membershipId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "workspace_member.role_updated",
          metadata: { from: membership.role, to: input.role, userId: membership.userId },
          subjectId: membershipId,
          subjectType: "workspace_membership",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return updated;
    });
  }

  async removeMember(principal: AuthenticatedPrincipal, workspaceId: string, membershipId: string) {
    const principalRole = this.assertCanManage(principal, workspaceId);
    const membership = await this.requireMembership(principal.tenantId, workspaceId, membershipId);
    if (membership.role === "owner") {
      if (principalRole !== "owner") {
        throw new ForbiddenException("Only an owner can remove another owner");
      }
      await this.assertAnotherOwner(principal.tenantId, workspaceId, membership.id);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workspaceMembership.delete({ where: { id: membershipId } });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "workspace_member.removed",
          metadata: { role: membership.role, userId: membership.userId },
          subjectId: membershipId,
          subjectType: "workspace_membership",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return { id: membershipId, removed: true };
    });
  }

  async revokeInvitation(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    invitationId: string,
  ) {
    const principalRole = this.assertCanManage(principal, workspaceId);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: {
        acceptedAt: null,
        id: invitationId,
        revokedAt: null,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
    if (!invitation) throw new NotFoundException("Workspace invitation was not found");
    if (invitation.role === "owner" && principalRole !== "owner") {
      throw new ForbiddenException("Only an owner can revoke an owner invitation");
    }

    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.workspaceInvitation.update({
        data: { revokedAt: new Date() },
        where: { id: invitationId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "workspace_invitation.revoked",
          metadata: { email: invitation.email, role: invitation.role },
          subjectId: invitationId,
          subjectType: "workspace_invitation",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return revoked;
    });
  }

  async getInvitation(token: string) {
    const invitation = await this.requireActiveInvitation(token);
    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      role: invitation.role,
      workspace: { id: invitation.workspace.id, name: invitation.workspace.name },
    };
  }

  async acceptInvitation(token: string, input: AcceptWorkspaceInvitationDto) {
    const invitation = await this.requireActiveInvitation(token);
    const passwordHash = await this.passwordService.hashPassword(input.password);
    const acceptedAt = new Date();

    const accepted = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: {
          tenantId_email: { email: invitation.email, tenantId: invitation.tenantId },
        },
      });
      if (existing?.deletedAt || existing?.status === "disabled") {
        throw new ConflictException("This account cannot accept the invitation");
      }
      const user = existing
        ? existing.status === "active"
          ? existing
          : await tx.user.update({
              data: {
                displayName: input.displayName.trim(),
                passwordHash,
                status: "active",
              },
              where: { id: existing.id },
            })
        : await tx.user.create({
            data: {
              displayName: input.displayName.trim(),
              email: invitation.email,
              passwordHash,
              status: "active",
              tenantId: invitation.tenantId,
            },
          });
      await tx.workspaceMembership.upsert({
        create: {
          role: invitation.role,
          tenantId: invitation.tenantId,
          userId: user.id,
          workspaceId: invitation.workspaceId,
        },
        update: { role: invitation.role },
        where: {
          workspaceId_userId: { userId: user.id, workspaceId: invitation.workspaceId },
        },
      });
      await tx.workspaceInvitation.update({
        data: { acceptedAt },
        where: { id: invitation.id },
      });
      await tx.workspaceInvitation.updateMany({
        data: { revokedAt: acceptedAt },
        where: {
          acceptedAt: null,
          email: invitation.email,
          id: { not: invitation.id },
          revokedAt: null,
          tenantId: invitation.tenantId,
          workspaceId: invitation.workspaceId,
        },
      });
      await this.auditService.record(
        {
          actorUserId: user.id,
          eventType: "workspace_invitation.accepted",
          metadata: { email: invitation.email, role: invitation.role },
          subjectId: invitation.id,
          subjectType: "workspace_invitation",
          tenantId: invitation.tenantId,
          workspaceId: invitation.workspaceId,
        },
        tx,
      );
      return user;
    });

    const memberships = await this.prisma.workspaceMembership.findMany({
      include: { workspace: true },
      where: { tenantId: invitation.tenantId, userId: accepted.id },
    });
    const workspaces = memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      role: membership.role,
      slug: membership.workspace.slug,
    }));
    return {
      ...this.tokenService.issueAccessToken({
        email: accepted.email,
        tenantId: accepted.tenantId,
        userId: accepted.id,
      }),
      user: { email: accepted.email, id: accepted.id, tenantId: accepted.tenantId },
      workspace: workspaces.find((workspace) => workspace.id === invitation.workspaceId)!,
      workspaces,
    };
  }

  async getPolicy(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    const policy = await this.prisma.workspacePolicySettings.findUnique({
      where: { workspaceId },
    });
    return (
      policy ?? {
        defaultConsentStatus: "unknown",
        defaultPurpose: "outreach_review",
        defaultRecipientRegion: "unknown",
        defaultRecipientType: "unknown",
        id: null,
        tenantId: principal.tenantId,
        workspaceId,
      }
    );
  }

  async updatePolicy(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    input: UpdateWorkspacePolicyDto,
  ) {
    this.assertCanManage(principal, workspaceId);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    const data = {
      defaultConsentStatus: input.defaultConsentStatus as ConsentStatus,
      defaultPurpose: input.defaultPurpose as PolicyPurpose,
      defaultRecipientRegion: input.defaultRecipientRegion.trim(),
      defaultRecipientType: input.defaultRecipientType as RecipientType,
    };
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.workspacePolicySettings.upsert({
        create: { ...data, tenantId: principal.tenantId, workspaceId },
        update: data,
        where: { workspaceId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "workspace_policy.updated",
          metadata: data,
          subjectId: policy.id,
          subjectType: "workspace_policy_settings",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return policy;
    });
  }

  async listConnectors(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    return this.prisma.connectorAccount.findMany({
      include: { runs: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { provider: "asc" },
      where: {
        status: { not: "revoked" },
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  async createConnector(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    input: CreateConnectorAccountDto,
  ) {
    this.assertCanManage(principal, workspaceId);
    await this.requireWorkspace(principal.tenantId, workspaceId);
    return this.prisma.$transaction(async (tx) => {
      const connector = await tx.connectorAccount.upsert({
        create: {
          displayName: input.displayName?.trim(),
          metadata: { configuredBy: "workspace_admin", secretsStored: false },
          provider: input.provider as SourceType,
          status: "active",
          tenantId: principal.tenantId,
          workspaceId,
        },
        update: { displayName: input.displayName?.trim(), status: "active" },
        where: {
          tenantId_workspaceId_provider: {
            provider: input.provider as SourceType,
            tenantId: principal.tenantId,
            workspaceId,
          },
        },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "connector_account.configured",
          metadata: { provider: input.provider, secretsStored: false },
          subjectId: connector.id,
          subjectType: "connector_account",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return connector;
    });
  }

  async updateConnector(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    connectorId: string,
    input: UpdateConnectorAccountDto,
  ) {
    this.assertCanManage(principal, workspaceId);
    const refreshUpdateRequested = hasConnectorRefreshUpdate(input);
    if (input.displayName === undefined && input.status === undefined && !refreshUpdateRequested) {
      throw new BadRequestException(
        "A connector update must change its name, status, or refresh schedule",
      );
    }
    const connector = await this.requireConnector(principal.tenantId, workspaceId, connectorId);
    if (
      refreshUpdateRequested &&
      input.refreshEnabled !== false &&
      !isConnectorSyncProvider(connector.provider)
    ) {
      throw new BadRequestException("Connector provider does not support scheduled refresh");
    }
    if (input.refreshEntityId) {
      const entity = await this.prisma.entity.findFirst({
        select: { id: true },
        where: {
          deletedAt: null,
          id: input.refreshEntityId,
          tenantId: principal.tenantId,
          workspaceId,
        },
      });
      if (!entity) throw new NotFoundException("Refresh entity was not found in this workspace");
    }
    const metadata = refreshUpdateRequested
      ? buildConnectorRefreshMetadata(connector.metadata, input)
      : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.connectorAccount.update({
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        where: { id: connectorId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "connector_account.updated",
          metadata: {
            provider: connector.provider,
            ...(metadata !== undefined ? { refreshEnabled: readRefreshEnabled(metadata) } : {}),
            status: updated.status,
          },
          subjectId: connectorId,
          subjectType: "connector_account",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return updated;
    });
  }

  async syncConnector(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    connectorId: string,
    input: SyncConnectorDto,
    idempotencyKey?: string,
  ) {
    this.assertCanManage(principal, workspaceId);
    const connector = await this.requireConnector(principal.tenantId, workspaceId, connectorId);
    if (connector.status !== "active") {
      throw new ConflictException("Only active connector accounts can be synchronized");
    }
    if (!isConnectorSyncProvider(connector.provider)) {
      throw new BadRequestException("Connector provider does not support synchronization");
    }
    if (input.entityId) {
      const entity = await this.prisma.entity.findFirst({
        select: { id: true },
        where: {
          deletedAt: null,
          id: input.entityId,
          tenantId: principal.tenantId,
          workspaceId,
        },
      });
      if (!entity) throw new NotFoundException("Entity was not found in this workspace");
    }

    const key = idempotencyKey?.trim() || `connector-sync:${crypto.randomUUID()}`;
    if (key.length < 8 || key.length > 200) {
      throw new BadRequestException("Idempotency-Key must be between 8 and 200 characters");
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.backgroundJob.findUnique({
        select: { ...backgroundJobStatusSelect, payload: true, workspaceId: true },
        where: {
          tenantId_queueName_idempotencyKey: {
            idempotencyKey: key,
            queueName: QueueName.ConnectorSync,
            tenantId: principal.tenantId,
          },
        },
      });
      if (existing) {
        const payload = parseConnectorSyncJobPayload(existing.payload);
        if (existing.workspaceId !== workspaceId || payload.connectorAccountId !== connectorId) {
          throw new ConflictException("Idempotency-Key is already used by another connector sync");
        }
        return pickBackgroundJobStatus(existing);
      }

      const run = await tx.connectorRun.create({
        data: {
          connectorAccountId: connector.id,
          metadata: { sourceIdentifier: input.sourceIdentifier.trim() },
          provider: connector.provider,
          status: "queued",
          tenantId: principal.tenantId,
          workspaceId,
        },
      });
      const payload: ConnectorSyncJobPayload = {
        connectorAccountId: connector.id,
        connectorRunId: run.id,
        entityId: input.entityId,
        provider: connector.provider as ConnectorSyncJobPayload["provider"],
        requestedByUserId: principal.userId,
        sourceIdentifier: input.sourceIdentifier.trim(),
        subjectName: input.subjectName?.trim(),
        tenantId: principal.tenantId,
        workspaceId,
      };
      const job = await tx.backgroundJob.create({
        data: {
          idempotencyKey: key,
          jobName: "connector.sync",
          payload: payload as unknown as Prisma.InputJsonValue,
          progress: { connectorRunId: run.id, percent: 0, stage: "queued" },
          queueName: QueueName.ConnectorSync,
          status: "queued",
          tenantId: principal.tenantId,
          workspaceId,
        },
        select: backgroundJobStatusSelect,
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "connector_sync.queued",
          metadata: { jobId: job.id, provider: connector.provider, runId: run.id },
          subjectId: run.id,
          subjectType: "connector_run",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return job;
    });
  }

  async revokeConnector(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    connectorId: string,
  ) {
    this.assertCanManage(principal, workspaceId);
    const connector = await this.requireConnector(principal.tenantId, workspaceId, connectorId);
    return this.prisma.$transaction(async (tx) => {
      const deletedCredential = await tx.connectorCredential.deleteMany({
        where: {
          connectorAccountId: connectorId,
          tenantId: principal.tenantId,
          workspaceId,
        },
      });
      const revoked = await tx.connectorAccount.update({
        data: { status: "revoked" },
        where: { id: connectorId },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "connector_account.revoked",
          metadata: {
            credentialDeleted: deletedCredential.count > 0,
            provider: connector.provider,
          },
          subjectId: connectorId,
          subjectType: "connector_account",
          tenantId: principal.tenantId,
          workspaceId,
        },
        tx,
      );
      return revoked;
    });
  }

  private async requireActiveInvitation(token: string) {
    if (token.trim().length < 20) throw new NotFoundException("Workspace invitation was not found");
    const invitation = await this.prisma.workspaceInvitation.findUnique({
      include: { workspace: true },
      where: { tokenHash: hashToken(token.trim()) },
    });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) {
      throw new NotFoundException("Workspace invitation was not found");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new GoneException("Workspace invitation has expired");
    }
    return invitation;
  }

  private requireWorkspace(tenantId: string, workspaceId: string) {
    return this.prisma.workspace.findFirstOrThrow({
      where: { deletedAt: null, id: workspaceId, tenantId },
    });
  }

  private async requireMembership(tenantId: string, workspaceId: string, membershipId: string) {
    const membership = await this.prisma.workspaceMembership.findFirst({
      include: { user: true },
      where: { id: membershipId, tenantId, workspaceId },
    });
    if (!membership) throw new NotFoundException("Workspace member was not found");
    return membership;
  }

  private async requireConnector(tenantId: string, workspaceId: string, connectorId: string) {
    const connector = await this.prisma.connectorAccount.findFirst({
      where: { id: connectorId, status: { not: "revoked" }, tenantId, workspaceId },
    });
    if (!connector) throw new NotFoundException("Connector account was not found");
    return connector;
  }

  private async assertAnotherOwner(tenantId: string, workspaceId: string, membershipId: string) {
    const otherOwners = await this.prisma.workspaceMembership.count({
      where: {
        id: { not: membershipId },
        role: "owner",
        tenantId,
        user: { deletedAt: null, status: "active" },
        workspaceId,
      },
    });
    if (otherOwners === 0) {
      throw new ConflictException("Assign another owner before changing the final owner");
    }
  }

  private assertCanManage(principal: AuthenticatedPrincipal, workspaceId: string): WorkspaceRole {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:manage")) {
      throw new ForbiddenException("You cannot manage this workspace");
    }
    return membership.role as WorkspaceRole;
  }

  private assertCanAssignRole(principalRole: WorkspaceRole, role: WorkspaceRoleInput): void {
    if (role === "owner" && principalRole !== "owner") {
      throw new ForbiddenException("Only an owner can assign the owner role");
    }
  }

  private assertCanChangeRole(
    principalRole: WorkspaceRole,
    currentRole: WorkspaceRole,
    nextRole: WorkspaceRoleInput,
  ): void {
    if ((currentRole === "owner" || nextRole === "owner") && principalRole !== "owner") {
      throw new ForbiddenException("Only an owner can change owner memberships");
    }
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function pickBackgroundJobStatus(job: {
  attempts: number;
  createdAt: Date;
  failureReason: null | string;
  id: string;
  jobName: string;
  maxAttempts: number;
  progress: Prisma.JsonValue;
  queueName: string;
  status: string;
  updatedAt: Date;
}) {
  return {
    attempts: job.attempts,
    createdAt: job.createdAt,
    failureReason: job.failureReason,
    id: job.id,
    jobName: job.jobName,
    maxAttempts: job.maxAttempts,
    progress: job.progress,
    queueName: job.queueName,
    status: job.status,
    updatedAt: job.updatedAt,
  };
}

function hasConnectorRefreshUpdate(input: UpdateConnectorAccountDto): boolean {
  return [
    input.refreshEnabled,
    input.refreshEntityId,
    input.refreshIntervalMinutes,
    input.refreshSourceIdentifier,
    input.refreshSubjectName,
  ].some((value) => value !== undefined);
}

function buildConnectorRefreshMetadata(
  metadata: Prisma.JsonValue,
  input: UpdateConnectorAccountDto,
): Prisma.InputJsonObject {
  const existingMetadata = readJsonObject(metadata);
  const existingRefresh = readJsonObject(existingMetadata.refresh);
  const enabled = input.refreshEnabled ?? existingRefresh.enabled === true;
  const intervalMinutes = input.refreshIntervalMinutes ?? existingRefresh.intervalMinutes;
  const sourceIdentifier =
    input.refreshSourceIdentifier !== undefined
      ? input.refreshSourceIdentifier.trim()
      : readJsonString(existingRefresh.sourceIdentifier);
  const entityId =
    input.refreshEntityId !== undefined
      ? input.refreshEntityId.trim()
      : readJsonString(existingRefresh.entityId);
  const subjectName =
    input.refreshSubjectName !== undefined
      ? input.refreshSubjectName.trim()
      : readJsonString(existingRefresh.subjectName);
  if (input.refreshSourceIdentifier !== undefined && !sourceIdentifier) {
    throw new BadRequestException("Refresh source identifier cannot be empty");
  }
  if (
    enabled &&
    (!Number.isInteger(intervalMinutes) ||
      typeof intervalMinutes !== "number" ||
      intervalMinutes < 5 ||
      intervalMinutes > 43_200 ||
      !sourceIdentifier)
  ) {
    throw new BadRequestException(
      "Enabling connector refresh requires a source identifier and interval from 5 to 43200 minutes",
    );
  }
  const refresh: Record<string, Prisma.InputJsonValue> = {
    configuredAt: new Date().toISOString(),
    enabled,
  };
  if (typeof intervalMinutes === "number") refresh.intervalMinutes = intervalMinutes;
  if (sourceIdentifier) refresh.sourceIdentifier = sourceIdentifier;
  if (entityId) refresh.entityId = entityId;
  if (subjectName) refresh.subjectName = subjectName;
  return { ...existingMetadata, refresh } as Prisma.InputJsonObject;
}

function readRefreshEnabled(metadata: Prisma.InputJsonObject): boolean {
  const refresh = readJsonObject(metadata.refresh);
  return refresh.enabled === true;
}

function readJsonObject(value: unknown): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

function readJsonString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isConnectorSyncProvider(
  provider: SourceType,
): provider is ConnectorSyncJobPayload["provider"] {
  return connectorSyncProviders.has(provider as ConnectorSyncJobPayload["provider"]);
}

function toInvitationSummary(invitation: {
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  role: WorkspaceRole;
}) {
  return {
    createdAt: invitation.createdAt,
    email: invitation.email,
    expiresAt: invitation.expiresAt,
    id: invitation.id,
    role: invitation.role,
  };
}
