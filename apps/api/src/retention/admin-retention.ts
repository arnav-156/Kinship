import type { PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";
import { type ObjectStoragePort, verifiedSnapshotObjectKeys } from "@relationship/storage";
import { randomUUID } from "node:crypto";

export const RETENTION_ADMIN_DATA_CLASS = "evidence";

export interface RetentionAdminTarget {
  operator: string;
  tenantId: string;
  workspaceId: string;
}

export class RetentionAdminUtility {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
    private readonly objectStorage?: ObjectStoragePort,
  ) {}

  async preview(target: RetentionAdminTarget) {
    const [workspace, policy] = await Promise.all([
      this.prisma.workspace.findFirst({
        select: { id: true, name: true },
        where: {
          deletedAt: null,
          id: target.workspaceId,
          tenantId: target.tenantId,
        },
      }),
      this.prisma.retentionPolicy.findUnique({
        where: {
          tenantId_workspaceId_dataClass: {
            dataClass: RETENTION_ADMIN_DATA_CLASS,
            tenantId: target.tenantId,
            workspaceId: target.workspaceId,
          },
        },
      }),
    ]);
    if (!workspace) {
      throw new Error("Workspace was not found in the requested tenant");
    }
    if (!policy) {
      throw new Error("Evidence retention policy was not found for this workspace");
    }

    const now = this.now();
    const [dueEvidenceItems, dueSourceSnapshots, nextEvidence, nextSnapshot] = await Promise.all([
      this.prisma.evidenceItem.count({
        where: {
          retentionExpiresAt: { lte: now },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      }),
      this.prisma.sourceSnapshot.count({
        where: {
          retentionExpiresAt: { lte: now },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      }),
      this.prisma.evidenceItem.findFirst({
        orderBy: { retentionExpiresAt: "asc" },
        select: { retentionExpiresAt: true },
        where: {
          retentionExpiresAt: { gt: now },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      }),
      this.prisma.sourceSnapshot.findFirst({
        orderBy: { retentionExpiresAt: "asc" },
        select: { retentionExpiresAt: true },
        where: {
          retentionExpiresAt: { gt: now },
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      }),
    ]);
    const nextExpirationAt = earliestDate(
      nextEvidence?.retentionExpiresAt,
      nextSnapshot?.retentionExpiresAt,
    );

    return {
      confirmation: `DELETE EXPIRED EVIDENCE ${target.workspaceId}`,
      dataClass: RETENTION_ADMIN_DATA_CLASS,
      dueEvidenceItems,
      dueSourceSnapshots,
      generatedAt: now.toISOString(),
      nextExpirationAt: nextExpirationAt?.toISOString() ?? null,
      policy: {
        enabled: policy.enabled,
        retentionDays: policy.retentionDays,
      },
      scope: {
        tenantId: target.tenantId,
        workspaceId: target.workspaceId,
        workspaceName: workspace.name,
      },
      totalDue: dueEvidenceItems + dueSourceSnapshots,
    };
  }

  async execute(target: RetentionAdminTarget, confirmation: string) {
    const preview = await this.preview(target);
    if (confirmation !== preview.confirmation) {
      throw new Error(`Confirmation must exactly match "${preview.confirmation}"`);
    }
    if (preview.totalDue === 0) {
      throw new Error("No expired evidence or source snapshots are due");
    }

    const executedAt = this.now();
    const job = await this.prisma.backgroundJob.create({
      data: {
        attempts: 1,
        idempotencyKey: `${target.workspaceId}:${executedAt.getTime()}:${randomUUID()}`,
        jobName: "retention.cleanup",
        payload: {
          dataClass: RETENTION_ADMIN_DATA_CLASS,
          operator: target.operator,
          trigger: "administrative",
        },
        progress: { percent: 10, stage: "deleting_expired_evidence" },
        queueName: QueueName.RetentionCleanup,
        status: "active",
        tenantId: target.tenantId,
        workspaceId: target.workspaceId,
      },
    });

    try {
      const deleted = await this.prisma.$transaction(async (tx) => {
        const evidence = await tx.evidenceItem.deleteMany({
          where: {
            retentionExpiresAt: { lte: executedAt },
            tenantId: target.tenantId,
            workspaceId: target.workspaceId,
          },
        });
        if (this.objectStorage) {
          const dueSnapshots = await tx.sourceSnapshot.findMany({
            select: { rawContentHash: true, storageKey: true },
            where: {
              evidenceItems: { none: {} },
              retentionExpiresAt: { lte: executedAt },
              tenantId: target.tenantId,
              workspaceId: target.workspaceId,
            },
          });
          const storageKeys = verifiedSnapshotObjectKeys(dueSnapshots, {
            tenantId: target.tenantId,
            workspaceId: target.workspaceId,
          });
          for (const key of storageKeys) await this.objectStorage.deleteObject(key);
        }
        const snapshots = await tx.sourceSnapshot.deleteMany({
          where: {
            evidenceItems: { none: {} },
            retentionExpiresAt: { lte: executedAt },
            tenantId: target.tenantId,
            workspaceId: target.workspaceId,
          },
        });
        return {
          evidenceItems: evidence.count,
          sourceSnapshots: snapshots.count,
          total: evidence.count + snapshots.count,
        };
      });
      const completed = await this.prisma.backgroundJob.update({
        data: {
          failureReason: null,
          progress: {
            deleted,
            percent: 100,
            stage: "completed",
            trigger: "administrative",
          },
          status: "completed",
        },
        where: { id: job.id },
      });
      await this.prisma.auditEvent.create({
        data: {
          eventType: "retention.cleanup.completed",
          metadata: {
            deleted,
            operator: target.operator,
            trigger: "administrative",
          },
          subjectId: job.id,
          subjectType: "background_job",
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      });

      return {
        deleted,
        executedAt: executedAt.toISOString(),
        job: completed,
      };
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Retention cleanup failed";
      await this.prisma.backgroundJob.update({
        data: {
          failureReason,
          progress: {
            percent: 100,
            stage: "failed",
            trigger: "administrative",
          },
          status: "failed",
        },
        where: { id: job.id },
      });
      await this.prisma.auditEvent.create({
        data: {
          eventType: "retention.cleanup.failed",
          metadata: {
            failureReason,
            operator: target.operator,
            trigger: "administrative",
          },
          subjectId: job.id,
          subjectType: "background_job",
          tenantId: target.tenantId,
          workspaceId: target.workspaceId,
        },
      });
      throw error;
    }
  }
}

function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}
