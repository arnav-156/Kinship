import { Inject, Injectable } from "@nestjs/common";
import type { BackgroundJob, PrismaClient } from "@relationship/db";
import { parseRetentionCleanupJobPayload } from "@relationship/queue";
import { type ObjectStoragePort, verifiedSnapshotObjectKeys } from "@relationship/storage";

import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";
import { WORKER_OBJECT_STORAGE } from "./worker-storage.token";

@Injectable()
export class RetentionCleanupProcessor {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(WORKER_OBJECT_STORAGE) private readonly objectStorage: ObjectStoragePort,
  ) {}

  async process(job: BackgroundJob, workerId: string): Promise<void> {
    const payload = parseRetentionCleanupJobPayload(job.payload);
    if (payload.tenantId !== job.tenantId || payload.workspaceId !== job.workspaceId) {
      throw new Error("Stored retention cleanup payload does not match its job scope");
    }
    const cutoffAt = new Date(payload.cutoffAt);

    await this.prisma.$transaction(async (tx) => {
      const evidence = await tx.evidenceItem.deleteMany({
        where: {
          retentionExpiresAt: { lte: cutoffAt },
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      const dueSnapshots = await tx.sourceSnapshot.findMany({
        select: { rawContentHash: true, storageKey: true },
        where: {
          evidenceItems: { none: {} },
          retentionExpiresAt: { lte: cutoffAt },
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      const storageKeys = verifiedSnapshotObjectKeys(dueSnapshots, {
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      });
      for (const key of storageKeys) await this.objectStorage.deleteObject(key);
      const snapshots = await tx.sourceSnapshot.deleteMany({
        where: {
          evidenceItems: { none: {} },
          retentionExpiresAt: { lte: cutoffAt },
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      const deleted = {
        evidenceItems: evidence.count,
        storageObjects: storageKeys.length,
        sourceSnapshots: snapshots.count,
        total: evidence.count + snapshots.count,
      };
      const completed = await tx.backgroundJob.updateMany({
        data: {
          completedAt: new Date(),
          failureReason: null,
          lockedAt: null,
          lockedBy: null,
          progress: { deleted, percent: 100, stage: "completed", trigger: payload.trigger },
          status: "completed",
        },
        where: { id: job.id, lockedBy: workerId, status: "active" },
      });
      if (completed.count !== 1) {
        throw new Error("Retention cleanup job lease was lost before completion");
      }

      await tx.auditEvent.create({
        data: {
          eventType: "retention.cleanup.completed",
          metadata: { cutoffAt: payload.cutoffAt, deleted, trigger: payload.trigger },
          subjectId: job.id,
          subjectType: "background_job",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
    });
  }
}
