import { describe, expect, it, vi } from "vitest";

import { ConnectorSyncWorker } from "./connector-sync.worker";

describe("ConnectorSyncWorker", () => {
  it("claims only queued connector-sync work before processing it", async () => {
    const queued = {
      attempts: 0,
      availableAt: new Date("2026-10-08T10:00:00.000Z"),
      id: "job_sync_1",
      maxAttempts: 3,
      payload: {},
      queueName: "connector-sync",
      status: "queued",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const claimed = { ...queued, attempts: 1, lockedBy: "worker_test", status: "active" };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const process = vi.fn().mockResolvedValue(undefined);
    const worker = new ConnectorSyncWorker(
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
        where: expect.objectContaining({ queueName: "connector-sync", status: "queued" }),
      }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job_sync_1" }),
      "worker_test",
    );
  });

  it("finalizes the connector run when an expired final lease is dead-lettered", async () => {
    const stale = {
      attempts: 3,
      id: "job_sync_1",
      lockedAt: new Date("2026-10-08T09:00:00.000Z"),
      lockedBy: "worker_crashed",
      maxAttempts: 3,
      payload: {
        connectorAccountId: "connector_1",
        connectorRunId: "run_1",
        provider: "github",
        requestedByUserId: "user_1",
        sourceIdentifier: "https://github.com/example/project",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      queueName: "connector-sync",
      status: "active",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const connectorRunUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const worker = new ConnectorSyncWorker(
      {
        auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
        backgroundJob: {
          findMany: vi.fn().mockResolvedValue([stale]),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        connectorRun: { updateMany: connectorRunUpdateMany },
      } as never,
      { process: vi.fn() } as never,
      { concurrency: 1, leaseMs: 30_000, pollIntervalMs: 1_000, workerId: "worker_test" },
    );

    await expect(worker.recoverExpiredLeases()).resolves.toBe(1);
    expect(connectorRunUpdateMany).toHaveBeenCalledWith({
      data: {
        failureReason: "Worker lease expired after the final attempt",
        finishedAt: expect.any(Date),
        status: "failed",
      },
      where: {
        connectorAccountId: "connector_1",
        id: "run_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    });
  });
});
