import { describe, expect, it, vi } from "vitest";

import { RetentionCleanupWorker } from "./retention-cleanup.worker";

describe("RetentionCleanupWorker", () => {
  it("claims only queued retention cleanup work before processing it", async () => {
    const queued = {
      attempts: 0,
      availableAt: new Date("2026-10-08T12:00:00.000Z"),
      id: "job_retention_1",
      maxAttempts: 3,
      payload: {},
      queueName: "retention-cleanup",
      status: "queued",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const claimed = { ...queued, attempts: 1, lockedBy: "worker_test", status: "active" };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const process = vi.fn().mockResolvedValue(undefined);
    const worker = new RetentionCleanupWorker(
      {
        auditEvent: { create: vi.fn() },
        backgroundJob: {
          findFirst: vi.fn().mockResolvedValue(queued),
          findUnique: vi.fn().mockResolvedValue(claimed),
          updateMany,
        },
      } as never,
      { process } as never,
      { concurrency: 1, leaseMs: 30_000, pollIntervalMs: 1_000, workerId: "worker_test" },
    );

    await expect(worker.runOnce()).resolves.toBe(true);
    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ queueName: "retention-cleanup", status: "queued" }),
      }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job_retention_1" }),
      "worker_test",
    );
  });
});
