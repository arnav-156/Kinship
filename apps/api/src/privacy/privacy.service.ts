import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { Prisma, type PrismaClient } from "@relationship/db";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../auth/password.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type { DeleteAccountDto } from "./dto";

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const EXPORT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class PrivacyService implements OnModuleInit, OnModuleDestroy {
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
  ) {}

  onModuleInit(): void {
    void this.cleanupExpiredExports();
    this.cleanupInterval = setInterval(() => {
      void this.cleanupExpiredExports();
    }, EXPORT_CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  async listRequests(principal: AuthenticatedPrincipal) {
    await this.cleanupExpiredExports();
    const requests = await this.prisma.userDataRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      where: {
        tenantId: principal.tenantId,
        userId: principal.userId,
      },
    });

    return requests.map((request) => this.toRequestSummary(request));
  }

  async requestExport(principal: AuthenticatedPrincipal) {
    const request = await this.prisma.userDataRequest.create({
      data: {
        requestType: "export",
        status: "processing",
        tenantId: principal.tenantId,
        userId: principal.userId,
      },
    });

    try {
      const snapshot = await this.buildExportSnapshot(principal);
      const completedAt = new Date();
      const completed = await this.prisma.userDataRequest.update({
        data: {
          completedAt,
          expiresAt: new Date(completedAt.getTime() + EXPORT_TTL_MS),
          result: toJson(snapshot),
          status: "completed",
        },
        where: { id: request.id },
      });

      await this.auditService.record({
        actorUserId: principal.userId,
        eventType: "privacy.export.completed",
        metadata: {
          expiresAt: completed.expiresAt?.toISOString(),
          requestId: request.id,
          totals: snapshot.totals,
        },
        subjectId: request.id,
        subjectType: "user_data_request",
        tenantId: principal.tenantId,
      });

      return this.toRequestSummary(completed);
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Data export failed";
      await this.prisma.userDataRequest.update({
        data: { failureReason, status: "failed" },
        where: { id: request.id },
      });
      await this.auditService.record({
        actorUserId: principal.userId,
        eventType: "privacy.export.failed",
        metadata: { requestId: request.id },
        subjectId: request.id,
        subjectType: "user_data_request",
        tenantId: principal.tenantId,
      });
      throw error;
    }
  }

  async exportStatus(principal: AuthenticatedPrincipal, requestId: string) {
    await this.cleanupExpiredExports();
    const request = await this.findExportRequest(principal, requestId);
    return this.toRequestSummary(request);
  }

  async downloadExport(principal: AuthenticatedPrincipal, requestId: string) {
    await this.cleanupExpiredExports();
    const request = await this.findExportRequest(principal, requestId);
    if (
      request.status !== "completed" ||
      !request.result ||
      !request.expiresAt ||
      request.expiresAt.getTime() <= Date.now()
    ) {
      throw new GoneException("This data export is no longer available. Request a new export.");
    }

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "privacy.export.downloaded",
      metadata: { requestId },
      subjectId: requestId,
      subjectType: "user_data_request",
      tenantId: principal.tenantId,
    });
    return request.result;
  }

  async requestDeletion(principal: AuthenticatedPrincipal, input: DeleteAccountDto) {
    const user = await this.prisma.user.findFirst({
      include: {
        memberships: {
          include: {
            workspace: {
              include: {
                memberships: {
                  include: {
                    user: { select: { deletedAt: true, status: true } },
                  },
                },
              },
            },
          },
        },
      },
      where: {
        deletedAt: null,
        id: principal.userId,
        status: "active",
        tenantId: principal.tenantId,
      },
    });
    if (
      !user ||
      !(await this.passwordService.verifyPassword(input.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    const blockedWorkspaces: string[] = [];
    const soloWorkspaceIds: string[] = [];
    for (const membership of user.memberships) {
      const activeMemberships = membership.workspace.memberships.filter(
        (item) => item.user.deletedAt === null && item.user.status === "active",
      );
      const otherOwnerExists = activeMemberships.some(
        (item) => item.userId !== user.id && item.role === "owner",
      );
      if (membership.role === "owner" && activeMemberships.length > 1 && !otherOwnerExists) {
        blockedWorkspaces.push(membership.workspace.name);
      }
      if (activeMemberships.length === 1) soloWorkspaceIds.push(membership.workspaceId);
    }
    if (blockedWorkspaces.length > 0) {
      throw new ConflictException(
        `Transfer ownership before deleting your account: ${blockedWorkspaces.join(", ")}`,
      );
    }

    const request = await this.prisma.userDataRequest.create({
      data: {
        requestType: "deletion",
        status: "processing",
        tenantId: principal.tenantId,
        userId: principal.userId,
      },
    });
    const deletedAt = new Date();
    const anonymizedEmail = `deleted+${crypto
      .createHash("sha256")
      .update(user.id)
      .digest("hex")
      .slice(0, 24)}@privacy.invalid`;
    const unusablePasswordHash = await this.passwordService.hashPassword(
      crypto.randomBytes(48).toString("base64url"),
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const notes = await tx.relationshipNote.deleteMany({
          where: { authorId: user.id, tenantId: principal.tenantId },
        });
        const draftVersions = await tx.draftMessageVersion.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: principal.tenantId },
        });
        const aiFeedback = await tx.aiQualityFeedback.updateMany({
          data: { submittedById: null },
          where: { submittedById: user.id, tenantId: principal.tenantId },
        });
        const prospectLists = await tx.prospectList.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: principal.tenantId },
        });
        const suppressions = await tx.suppressionEntry.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: principal.tenantId },
        });
        const audits = await tx.auditEvent.updateMany({
          data: { actorUserId: null, metadata: { redacted: true } },
          where: { actorUserId: user.id, tenantId: principal.tenantId },
        });
        const jobs = await tx.$executeRaw(Prisma.sql`
          UPDATE background_jobs
          SET payload = (payload - 'requestedByUserId' - 'userId') || '{"requesterRedacted":true}'::jsonb
          WHERE tenant_id = ${principal.tenantId}
            AND (payload->>'requestedByUserId' = ${user.id} OR payload->>'userId' = ${user.id})
        `);

        const memberships = await tx.workspaceMembership.deleteMany({
          where: { tenantId: principal.tenantId, userId: user.id },
        });
        if (soloWorkspaceIds.length > 0) {
          await tx.workspace.updateMany({
            data: { deletedAt },
            where: {
              deletedAt: null,
              id: { in: soloWorkspaceIds },
              tenantId: principal.tenantId,
            },
          });
        }

        await tx.user.update({
          data: {
            deletedAt,
            displayName: null,
            email: anonymizedEmail,
            lastLoginAt: null,
            passwordHash: unusablePasswordHash,
            region: null,
            status: "disabled",
          },
          where: { id: user.id },
        });

        const activeUsers = await tx.user.count({
          where: { deletedAt: null, status: "active", tenantId: principal.tenantId },
        });
        if (activeUsers === 0) {
          await tx.tenant.update({
            data: { deletedAt },
            where: { id: principal.tenantId },
          });
        }

        const summary = {
          deactivatedWorkspaces: soloWorkspaceIds.length,
          removed: {
            memberships: memberships.count,
            relationshipNotes: notes.count,
          },
          scrubbed: {
            aiFeedback: aiFeedback.count,
            auditEvents: audits.count,
            backgroundJobs: Number(jobs),
            draftVersions: draftVersions.count,
            prospectLists: prospectLists.count,
            suppressions: suppressions.count,
          },
        };
        const completed = await tx.userDataRequest.update({
          data: {
            completedAt: deletedAt,
            result: toJson(summary),
            status: "completed",
          },
          where: { id: request.id },
        });
        await tx.auditEvent.create({
          data: {
            eventType: "privacy.deletion.completed",
            metadata: toJson(summary),
            subjectId: request.id,
            subjectType: "user_data_request",
            tenantId: principal.tenantId,
          },
        });

        return { completed, summary };
      });

      return {
        deletedAt: deletedAt.toISOString(),
        request: this.toRequestSummary(result.completed),
        signedOut: true,
        summary: result.summary,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Account deletion failed";
      await this.prisma.userDataRequest.update({
        data: { failureReason, status: "failed" },
        where: { id: request.id },
      });
      await this.auditService.record({
        actorUserId: principal.userId,
        eventType: "privacy.deletion.failed",
        metadata: { requestId: request.id },
        subjectId: request.id,
        subjectType: "user_data_request",
        tenantId: principal.tenantId,
      });
      throw error;
    }
  }

  private async buildExportSnapshot(principal: AuthenticatedPrincipal) {
    const [
      user,
      memberships,
      notes,
      draftVersions,
      aiFeedback,
      prospectLists,
      suppressions,
      auditEvents,
    ] = await Promise.all([
      this.prisma.user.findFirstOrThrow({
        select: {
          createdAt: true,
          displayName: true,
          email: true,
          id: true,
          lastLoginAt: true,
          region: true,
          status: true,
          updatedAt: true,
        },
        where: { deletedAt: null, id: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.workspaceMembership.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          role: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
        where: { tenantId: principal.tenantId, userId: principal.userId },
      }),
      this.prisma.relationshipNote.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          body: true,
          createdAt: true,
          entity: { select: { canonicalName: true, id: true } },
          id: true,
          updatedAt: true,
          workspaceId: true,
        },
        where: { authorId: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.draftMessageVersion.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          body: true,
          channelType: true,
          createdAt: true,
          draft: { select: { subjectEntity: { select: { canonicalName: true, id: true } } } },
          draftId: true,
          id: true,
          reason: true,
          status: true,
          tone: true,
          variant: true,
          version: true,
          workspaceId: true,
        },
        where: { createdById: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.aiQualityFeedback.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          aiRunId: true,
          briefId: true,
          comment: true,
          createdAt: true,
          draftId: true,
          id: true,
          rating: true,
          reason: true,
          targetType: true,
          targetUpdatedAt: true,
          updatedAt: true,
          workspaceId: true,
        },
        where: { submittedById: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.prospectList.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          deletedAt: true,
          description: true,
          id: true,
          name: true,
          updatedAt: true,
          workspaceId: true,
        },
        where: { createdById: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.suppressionEntry.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          channelType: true,
          createdAt: true,
          deletedAt: true,
          id: true,
          reason: true,
          source: true,
          valueHash: true,
          workspaceId: true,
        },
        where: { createdById: principal.userId, tenantId: principal.tenantId },
      }),
      this.prisma.auditEvent.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          eventType: true,
          id: true,
          metadata: true,
          subjectId: true,
          subjectType: true,
          workspaceId: true,
        },
        where: { actorUserId: principal.userId, tenantId: principal.tenantId },
      }),
    ]);

    return {
      account: user,
      activity: { auditEvents },
      authoredContent: { aiFeedback, draftVersions, notes, prospectLists, suppressions },
      generatedAt: new Date().toISOString(),
      memberships,
      scope: "Authenticated account data and directly authored workspace content",
      totals: {
        aiFeedback: aiFeedback.length,
        auditEvents: auditEvents.length,
        draftVersions: draftVersions.length,
        memberships: memberships.length,
        notes: notes.length,
        prospectLists: prospectLists.length,
        suppressions: suppressions.length,
      },
      version: "1.0",
    };
  }

  private async findExportRequest(principal: AuthenticatedPrincipal, requestId: string) {
    const request = await this.prisma.userDataRequest.findFirst({
      where: {
        id: requestId,
        requestType: "export",
        tenantId: principal.tenantId,
        userId: principal.userId,
      },
    });
    if (!request) throw new NotFoundException("Data export request was not found");
    return request;
  }

  private toRequestSummary(request: {
    completedAt: Date | null;
    createdAt: Date;
    expiresAt: Date | null;
    failureReason: string | null;
    id: string;
    requestType: "export" | "deletion";
    result: Prisma.JsonValue | null;
    status: "processing" | "completed" | "failed";
    updatedAt: Date;
  }) {
    const downloadAvailable =
      request.requestType === "export" &&
      request.status === "completed" &&
      request.result !== null &&
      Boolean(request.expiresAt && request.expiresAt.getTime() > Date.now());
    return {
      completedAt: request.completedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
      downloadAvailable,
      expiresAt: request.expiresAt?.toISOString() ?? null,
      failureReason: request.failureReason,
      id: request.id,
      requestType: request.requestType,
      status: request.status,
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private async cleanupExpiredExports(): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE user_data_requests
      SET result = NULL, updated_at = NOW()
      WHERE request_type = 'export'
        AND result IS NOT NULL
        AND expires_at <= NOW()
    `);
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
