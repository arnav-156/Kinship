import { describe, expect, it, vi } from "vitest";
import { contentHash, snapshotObjectKey } from "@relationship/storage";

import { RetentionCleanupProcessor } from "./retention-cleanup.processor";

describe("RetentionCleanupProcessor", () => {
  it("deletes only evidence due at the scheduled cutoff and completes atomically", async () => {
    const rawContentHash = contentHash(new TextEncoder().encode("expired snapshot"));
    const storageKey = snapshotObjectKey({
      contentHash: rawContentHash,
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const cutoffAt = new Date("2026-10-08T12:00:00.000Z");
    const evidenceDelete = vi.fn().mockResolvedValue({ count: 2 });
    const snapshotDelete = vi.fn().mockResolvedValue({ count: 1 });
    const snapshotFind = vi.fn().mockResolvedValue([{ rawContentHash, storageKey }]);
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const jobUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      auditEvent: { create: auditCreate },
      backgroundJob: { updateMany: jobUpdate },
      evidenceItem: { deleteMany: evidenceDelete },
      sourceSnapshot: { deleteMany: snapshotDelete, findMany: snapshotFind },
    };
    const processor = new RetentionCleanupProcessor(prisma as never, { deleteObject } as never);

    await processor.process(
      {
        id: "job_retention_1",
        payload: {
          cutoffAt: cutoffAt.toISOString(),
          dataClass: "evidence",
          tenantId: "tenant_1",
          trigger: "scheduled",
          workspaceId: "workspace_1",
        },
        queueName: "retention-cleanup",
        status: "active",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      } as never,
      "worker_test",
    );

    expect(evidenceDelete).toHaveBeenCalledWith({
      where: {
        retentionExpiresAt: { lte: cutoffAt },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(snapshotDelete).toHaveBeenCalledWith({
      where: {
        evidenceItems: { none: {} },
        retentionExpiresAt: { lte: cutoffAt },
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
    expect(deleteObject).toHaveBeenCalledWith(storageKey);
    expect(jobUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        completedAt: expect.any(Date),
        progress: {
          deleted: { evidenceItems: 2, sourceSnapshots: 1, storageObjects: 1, total: 3 },
          percent: 100,
          stage: "completed",
          trigger: "scheduled",
        },
        status: "completed",
      }),
      where: { id: "job_retention_1", lockedBy: "worker_test", status: "active" },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "retention.cleanup.completed" }),
    });
  });

  it("rolls back database cleanup when an object cannot be removed", async () => {
    const rawContentHash = contentHash(new TextEncoder().encode("expired snapshot"));
    const storageKey = snapshotObjectKey({
      contentHash: rawContentHash,
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      evidenceItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      sourceSnapshot: {
        deleteMany: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ rawContentHash, storageKey }]),
      },
    };
    const processor = new RetentionCleanupProcessor(
      prisma as never,
      {
        deleteObject: vi.fn().mockRejectedValue(new Error("object store unavailable")),
      } as never,
    );

    await expect(
      processor.process(
        {
          id: "job_retention_1",
          payload: {
            cutoffAt: "2026-10-08T12:00:00.000Z",
            dataClass: "evidence",
            tenantId: "tenant_1",
            trigger: "scheduled",
            workspaceId: "workspace_1",
          },
          queueName: "retention-cleanup",
          status: "active",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        } as never,
        "worker_test",
      ),
    ).rejects.toThrow("object store unavailable");
    expect(prisma.sourceSnapshot.deleteMany).not.toHaveBeenCalled();
  });
});
