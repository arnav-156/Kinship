import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type {
  ChannelType,
  ConsentStatus,
  PolicyPurpose,
  Prisma,
  PrismaClient,
  RecipientType,
  SourceType,
} from "@relationship/db";
import { canPerformWorkspaceAction, evaluateCompliancePolicy } from "@relationship/policy";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import { hashContactValue } from "./contact-value";
import type {
  CreateSuppressionEntryDto,
  EvaluateComplianceDto,
  UpsertContactChannelDto,
} from "./dto";

@Injectable()
export class ComplianceService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async upsertContactChannel(principal: AuthenticatedPrincipal, input: UpsertContactChannelDto) {
    this.assertCanCapturePolicyContext(principal, input.workspaceId);
    await this.assertEntityInWorkspace(principal, input.workspaceId, input.entityId);
    const valueHash = hashContactValue(input.channelType, input.value);

    const channel = await this.prisma.contactChannel.upsert({
      create: {
        channelType: input.channelType as ChannelType,
        consentStatus: (input.consentStatus ?? "unknown") as ConsentStatus,
        entityId: input.entityId,
        label: input.label,
        purpose: input.purpose as PolicyPurpose,
        recipientRegion: input.recipientRegion.trim(),
        recipientType: input.recipientType as RecipientType,
        tenantId: principal.tenantId,
        valueHash,
        workspaceId: input.workspaceId,
      },
      update: {
        consentStatus: input.consentStatus as ConsentStatus,
        label: input.label,
        purpose: input.purpose as PolicyPurpose,
        recipientRegion: input.recipientRegion.trim(),
        recipientType: input.recipientType as RecipientType,
      },
      where: {
        tenantId_workspaceId_channelType_valueHash: {
          channelType: input.channelType as ChannelType,
          tenantId: principal.tenantId,
          valueHash,
          workspaceId: input.workspaceId ?? null,
        },
      },
    });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "contact_channel.upserted",
      metadata: {
        channelType: input.channelType,
        consentStatus: channel.consentStatus,
        purpose: channel.purpose,
        recipientRegion: channel.recipientRegion,
        recipientType: channel.recipientType,
      },
      subjectId: channel.id,
      subjectType: "contact_channel",
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    });

    return channel;
  }

  listContactChannels(principal: AuthenticatedPrincipal, workspaceId: string, entityId: string) {
    this.assertCanReadWorkspace(principal, workspaceId);
    return this.prisma.contactChannel.findMany({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        entityId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  async createSuppression(principal: AuthenticatedPrincipal, input: CreateSuppressionEntryDto) {
    if (input.workspaceId) {
      this.assertCanManageCompliance(principal, input.workspaceId);
    } else if (
      !principal.workspaceRoles.some((membership) =>
        canPerformWorkspaceAction(membership.role, "retention:manage"),
      )
    ) {
      throw new ForbiddenException("Tenant-wide suppression requires owner or admin access");
    }

    const valueHash = hashContactValue(input.channelType, input.value);
    const existing = await this.prisma.suppressionEntry.findFirst({
      where: {
        channelType: input.channelType as ChannelType,
        tenantId: principal.tenantId,
        valueHash,
        workspaceId: input.workspaceId ?? null,
      },
    });
    const entry = existing
      ? await this.prisma.suppressionEntry.update({
          data: {
            deletedAt: null,
            reason: input.reason,
            source: input.source ?? "manual",
          },
          where: {
            id: existing.id,
          },
        })
      : await this.prisma.suppressionEntry.create({
          data: {
            channelType: input.channelType as ChannelType,
            createdById: principal.userId,
            reason: input.reason,
            source: input.source ?? "manual",
            tenantId: principal.tenantId,
            valueHash,
            workspaceId: input.workspaceId,
          },
        });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "suppression.created",
      metadata: {
        channelType: input.channelType,
        scope: input.workspaceId ? "workspace" : "tenant",
      },
      subjectId: entry.id,
      subjectType: "suppression_entry",
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    });

    return entry;
  }

  async listSuppressions(principal: AuthenticatedPrincipal, workspaceId?: string) {
    if (workspaceId) {
      this.assertCanManageCompliance(principal, workspaceId);
    } else if (
      !principal.workspaceRoles.some((membership) =>
        canPerformWorkspaceAction(membership.role, "retention:manage"),
      )
    ) {
      throw new ForbiddenException("Tenant-wide suppression access requires owner or admin access");
    }

    return this.prisma.suppressionEntry.findMany({
      orderBy: {
        createdAt: "desc",
      },
      where: {
        deletedAt: null,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }

  async deleteSuppression(principal: AuthenticatedPrincipal, suppressionId: string) {
    const entry = await this.prisma.suppressionEntry.findFirst({
      where: {
        deletedAt: null,
        id: suppressionId,
        tenantId: principal.tenantId,
      },
    });

    if (!entry) {
      throw new NotFoundException("Suppression entry was not found");
    }

    if (entry.workspaceId) {
      this.assertCanManageCompliance(principal, entry.workspaceId);
    } else if (
      !principal.workspaceRoles.some((membership) =>
        canPerformWorkspaceAction(membership.role, "retention:manage"),
      )
    ) {
      throw new ForbiddenException("Tenant-wide suppression access requires owner or admin access");
    }

    const deleted = await this.prisma.suppressionEntry.update({
      data: {
        deletedAt: new Date(),
      },
      where: {
        id: suppressionId,
      },
    });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "suppression.deleted",
      subjectId: suppressionId,
      subjectType: "suppression_entry",
      tenantId: principal.tenantId,
      workspaceId: entry.workspaceId ?? undefined,
    });

    return deleted;
  }

  async evaluate(principal: AuthenticatedPrincipal, input: EvaluateComplianceDto) {
    this.assertCanReadWorkspace(principal, input.workspaceId);
    await this.assertEntityInWorkspace(principal, input.workspaceId, input.entityId);

    const channel = await this.prisma.contactChannel.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      where: {
        channelType: input.channelType as ChannelType,
        entityId: input.entityId,
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
    });
    const suppressionStatus = channel
      ? await this.getSuppressionStatus(
          principal.tenantId,
          input.workspaceId,
          input.channelType as ChannelType,
          channel.valueHash,
        )
      : "clear";

    const policyContext = {
      channelType: input.channelType,
      consentStatus: (channel?.consentStatus ?? "unknown") as "confirmed" | "unknown" | "withdrawn",
      purpose: (channel?.purpose ?? "outreach_review") as
        "relationship_intelligence" | "outreach_review",
      recipientRegion: channel?.recipientRegion ?? "unknown",
      recipientType: (channel?.recipientType ?? "unknown") as
        "personal" | "professional" | "unknown",
      sourceType: (input.sourceType ?? "user_url") as SourceType,
      suppressionStatus,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    };
    const result = evaluateCompliancePolicy(policyContext);

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: result.auditEventType,
      metadata: { ...result, policyContext } as unknown as Prisma.InputJsonValue,
      subjectId: input.entityId,
      subjectType: "entity",
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    });

    return {
      ...result,
      contactChannelId: channel?.id,
      policyContext,
      suppressionStatus,
    };
  }

  async evaluateDraftChannel(input: {
    channelType: ChannelType;
    entityId: string;
    sourceType?: SourceType;
    tenantId: string;
    workspaceId: string;
  }) {
    const channel = await this.prisma.contactChannel.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      where: {
        channelType: input.channelType,
        entityId: input.entityId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
    });
    const suppressionStatus = channel
      ? await this.getSuppressionStatus(
          input.tenantId,
          input.workspaceId,
          input.channelType,
          channel.valueHash,
        )
      : "clear";

    const policyContext = {
      channelType: input.channelType,
      consentStatus: (channel?.consentStatus ?? "unknown") as "confirmed" | "unknown" | "withdrawn",
      purpose: (channel?.purpose ?? "outreach_review") as
        "relationship_intelligence" | "outreach_review",
      recipientRegion: channel?.recipientRegion ?? "unknown",
      recipientType: (channel?.recipientType ?? "unknown") as
        "personal" | "professional" | "unknown",
      sourceType: input.sourceType ?? "user_url",
      suppressionStatus,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
    };

    return {
      ...evaluateCompliancePolicy(policyContext),
      policyContext,
    };
  }

  private async getSuppressionStatus(
    tenantId: string,
    workspaceId: string,
    channelType: ChannelType,
    valueHash: string,
  ): Promise<"clear" | "suppressed"> {
    const suppression = await this.prisma.suppressionEntry.findFirst({
      where: {
        channelType,
        deletedAt: null,
        OR: [
          {
            workspaceId,
          },
          {
            workspaceId: null,
          },
        ],
        tenantId,
        valueHash,
      },
    });

    return suppression ? "suppressed" : "clear";
  }

  private async assertEntityInWorkspace(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    entityId: string,
  ): Promise<void> {
    const entity = await this.prisma.entity.findFirst({
      where: {
        deletedAt: null,
        id: entityId,
        tenantId: principal.tenantId,
        workspaceId,
      },
    });

    if (!entity) {
      throw new NotFoundException("Entity was not found in this workspace");
    }
  }

  private assertCanReadWorkspace(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:read")) {
      throw new ForbiddenException("You do not have access to this workspace");
    }
  }

  private assertCanCapturePolicyContext(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
  ): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "draft:write")) {
      throw new ForbiddenException("Policy context updates require workspace write access");
    }
  }

  private assertCanManageCompliance(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "retention:manage")) {
      throw new ForbiddenException("Compliance management requires owner or admin access");
    }
  }
}

export { hashContactValue } from "./contact-value";
