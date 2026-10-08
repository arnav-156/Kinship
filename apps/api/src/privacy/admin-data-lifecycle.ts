import { Prisma, type PrismaClient } from "@relationship/db";
import crypto from "node:crypto";

const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export interface AdminDataTarget {
  operator: string;
  tenantId: string;
  userId: string;
}

export class AdminDataLifecycleUtility {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exportData(target: AdminDataTarget) {
    await this.prisma.user.findFirstOrThrow({
      select: { id: true },
      where: {
        deletedAt: null,
        id: target.userId,
        tenantId: target.tenantId,
      },
    });
    const request = await this.prisma.userDataRequest.create({
      data: {
        requestType: "export",
        status: "processing",
        tenantId: target.tenantId,
        userId: target.userId,
      },
    });

    try {
      const snapshot = await this.buildExportSnapshot(target);
      const completedAt = this.now();
      const completed = await this.prisma.userDataRequest.update({
        data: {
          completedAt,
          expiresAt: new Date(completedAt.getTime() + EXPORT_TTL_MS),
          result: toJson(snapshot),
          status: "completed",
        },
        where: { id: request.id },
      });
      await this.prisma.auditEvent.create({
        data: {
          eventType: "privacy.admin_export.completed",
          metadata: toJson({
            expiresAt: completed.expiresAt?.toISOString(),
            operator: target.operator,
            requestId: request.id,
            totals: snapshot.totals,
          }),
          subjectId: request.id,
          subjectType: "user_data_request",
          tenantId: target.tenantId,
        },
      });
      return {
        expiresAt: completed.expiresAt?.toISOString() ?? null,
        requestId: request.id,
        snapshot,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Administrative export failed";
      await this.prisma.userDataRequest.update({
        data: { failureReason, status: "failed" },
        where: { id: request.id },
      });
      await this.prisma.auditEvent.create({
        data: {
          eventType: "privacy.admin_export.failed",
          metadata: toJson({ operator: target.operator, requestId: request.id }),
          subjectId: request.id,
          subjectType: "user_data_request",
          tenantId: target.tenantId,
        },
      });
      throw error;
    }
  }

  async previewDeletion(target: AdminDataTarget) {
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
        id: target.userId,
        status: "active",
        tenantId: target.tenantId,
      },
    });
    if (!user) {
      throw new Error("Active user was not found in the requested tenant");
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
      if (activeMemberships.length === 1) {
        soloWorkspaceIds.push(membership.workspaceId);
      }
    }

    const [
      memberships,
      notes,
      draftVersions,
      aiFeedback,
      prospectLists,
      suppressions,
      auditEvents,
      backgroundJobRows,
      activeUsers,
    ] = await Promise.all([
      this.prisma.workspaceMembership.count({
        where: { tenantId: target.tenantId, userId: target.userId },
      }),
      this.prisma.relationshipNote.count({
        where: { authorId: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.draftMessageVersion.count({
        where: { createdById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.aiQualityFeedback.count({
        where: { submittedById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.prospectList.count({
        where: { createdById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.suppressionEntry.count({
        where: { createdById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.auditEvent.count({
        where: { actorUserId: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM background_jobs
        WHERE tenant_id = ${target.tenantId}
          AND (
            payload->>'requestedByUserId' = ${target.userId}
            OR payload->>'userId' = ${target.userId}
          )
      `),
      this.prisma.user.count({
        where: { deletedAt: null, status: "active", tenantId: target.tenantId },
      }),
    ]);

    return {
      blocked: blockedWorkspaces.length > 0,
      blockedWorkspaces,
      confirmation: `DELETE ${target.userId}`,
      generatedAt: this.now().toISOString(),
      impact: {
        deactivatesTenant: activeUsers === 1,
        deactivatesWorkspaces: soloWorkspaceIds.length,
        removes: { memberships, relationshipNotes: notes },
        scrubs: {
          aiFeedback,
          auditEvents,
          backgroundJobs: backgroundJobRows[0]?.count ?? 0,
          draftVersions,
          prospectLists,
          suppressions,
        },
      },
      target: {
        displayName: user.displayName,
        email: user.email,
        tenantId: target.tenantId,
        userId: user.id,
      },
    };
  }

  async executeDeletion(target: AdminDataTarget, confirmation: string) {
    const plan = await this.previewDeletion(target);
    if (confirmation !== plan.confirmation) {
      throw new Error(`Confirmation must exactly match "${plan.confirmation}"`);
    }
    if (plan.blocked) {
      throw new Error(`Transfer ownership before deletion: ${plan.blockedWorkspaces.join(", ")}`);
    }

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
        id: target.userId,
        status: "active",
        tenantId: target.tenantId,
      },
    });
    if (!user) {
      throw new Error("Active user was not found in the requested tenant");
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
      if (activeMemberships.length === 1) {
        soloWorkspaceIds.push(membership.workspaceId);
      }
    }
    if (blockedWorkspaces.length > 0) {
      throw new Error(`Transfer ownership before deletion: ${blockedWorkspaces.join(", ")}`);
    }

    const request = await this.prisma.userDataRequest.create({
      data: {
        requestType: "deletion",
        status: "processing",
        tenantId: target.tenantId,
        userId: target.userId,
      },
    });
    const deletedAt = this.now();
    const anonymizedEmail = `deleted+${crypto
      .createHash("sha256")
      .update(user.id)
      .digest("hex")
      .slice(0, 24)}@privacy.invalid`;
    const unusablePasswordHash = `disabled:${crypto.randomBytes(48).toString("base64url")}`;

    try {
      const summary = await this.prisma.$transaction(async (tx) => {
        const notes = await tx.relationshipNote.deleteMany({
          where: { authorId: user.id, tenantId: target.tenantId },
        });
        const draftVersions = await tx.draftMessageVersion.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: target.tenantId },
        });
        const aiFeedback = await tx.aiQualityFeedback.updateMany({
          data: { submittedById: null },
          where: { submittedById: user.id, tenantId: target.tenantId },
        });
        const prospectLists = await tx.prospectList.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: target.tenantId },
        });
        const suppressions = await tx.suppressionEntry.updateMany({
          data: { createdById: null },
          where: { createdById: user.id, tenantId: target.tenantId },
        });
        const audits = await tx.auditEvent.updateMany({
          data: { actorUserId: null, metadata: { redacted: true } },
          where: { actorUserId: user.id, tenantId: target.tenantId },
        });
        const jobs = await tx.$executeRaw(Prisma.sql`
          UPDATE background_jobs
          SET payload = (payload - 'requestedByUserId' - 'userId')
            || '{"requesterRedacted":true}'::jsonb
          WHERE tenant_id = ${target.tenantId}
            AND (
              payload->>'requestedByUserId' = ${user.id}
              OR payload->>'userId' = ${user.id}
            )
        `);
        const memberships = await tx.workspaceMembership.deleteMany({
          where: { tenantId: target.tenantId, userId: user.id },
        });

        if (soloWorkspaceIds.length > 0) {
          await tx.workspace.updateMany({
            data: { deletedAt },
            where: {
              deletedAt: null,
              id: { in: soloWorkspaceIds },
              tenantId: target.tenantId,
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
          where: { deletedAt: null, status: "active", tenantId: target.tenantId },
        });
        if (activeUsers === 0) {
          await tx.tenant.update({
            data: { deletedAt },
            where: { id: target.tenantId },
          });
        }

        const result = {
          deactivatedTenant: activeUsers === 0,
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
        await tx.userDataRequest.update({
          data: {
            completedAt: deletedAt,
            result: toJson(result),
            status: "completed",
          },
          where: { id: request.id },
        });
        await tx.auditEvent.create({
          data: {
            eventType: "privacy.admin_deletion.completed",
            metadata: toJson({
              operator: target.operator,
              requestId: request.id,
              summary: result,
            }),
            subjectId: request.id,
            subjectType: "user_data_request",
            tenantId: target.tenantId,
          },
        });
        return result;
      });

      return {
        deletedAt: deletedAt.toISOString(),
        requestId: request.id,
        summary,
      };
    } catch (error) {
      const failureReason =
        error instanceof Error ? error.message : "Administrative deletion failed";
      await this.prisma.userDataRequest.update({
        data: { failureReason, status: "failed" },
        where: { id: request.id },
      });
      await this.prisma.auditEvent.create({
        data: {
          eventType: "privacy.admin_deletion.failed",
          metadata: toJson({ operator: target.operator, requestId: request.id }),
          subjectId: request.id,
          subjectType: "user_data_request",
          tenantId: target.tenantId,
        },
      });
      throw error;
    }
  }

  private async buildExportSnapshot(target: AdminDataTarget) {
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
        where: { deletedAt: null, id: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.workspaceMembership.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          role: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
        where: { tenantId: target.tenantId, userId: target.userId },
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
        where: { authorId: target.userId, tenantId: target.tenantId },
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
        where: { createdById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.aiQualityFeedback.findMany({
        orderBy: { createdAt: "asc" },
        where: { submittedById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.prospectList.findMany({
        orderBy: { createdAt: "asc" },
        where: { createdById: target.userId, tenantId: target.tenantId },
      }),
      this.prisma.suppressionEntry.findMany({
        orderBy: { createdAt: "asc" },
        where: { createdById: target.userId, tenantId: target.tenantId },
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
        where: { actorUserId: target.userId, tenantId: target.tenantId },
      }),
    ]);

    return {
      account: user,
      activity: { auditEvents },
      authoredContent: { aiFeedback, draftVersions, notes, prospectLists, suppressions },
      generatedAt: this.now().toISOString(),
      memberships,
      scope: { tenantId: target.tenantId, userId: target.userId },
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
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
