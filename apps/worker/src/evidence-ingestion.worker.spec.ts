import { describe, expect, it, vi } from "vitest";

import { EvidenceIngestionWorker, retryDelayMs } from "./evidence-ingestion.worker";

const payload = {
  requestedByUserId: "user_1",
  sourceIdentifier: "https://example.com",
  sourceType: "user_url" as const,
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

const queuedJob = {
  attempts: 0,
  availableAt: new Date("2026-07-15T12:00:00.000Z"),
  id: "job_1",
  maxAttempts: 3,
  payload,
  queueName: "evidence-ingestion",
  status: "queued",
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

function createWorker(options: { attempts?: number; processError?: Error } = {}) {
  const claimedJob = {
    ...queuedJob,
    attempts: options.attempts ?? 1,
    lockedAt: new Date(),
    lockedBy: "worker_test",
    status: "active",
  };
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    backgroundJob: {
      findFirst: vi.fn().mockResolvedValue(queuedJob),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(claimedJob),
      updateMany,
    },
  };
  const process = options.processError
    ? vi.fn().mockRejectedValue(options.processError)
    : vi.fn().mockResolvedValue(undefined);
  const worker = new EvidenceIngestionWorker(prisma as never, { process } as never, {
    concurrency: 1,
    leaseMs: 30_000,
    pollIntervalMs: 1_000,
    workerId: "worker_test",
  });
  return { process, updateMany, worker };
}

describe("EvidenceIngestionWorker", () => {
  it("claims a queued job before passing it to the processor", async () => {
    const { process, updateMany, worker } = createWorker();

    await expect(worker.runOnce()).resolves.toBe(true);

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          attempts: { increment: 1 },
          lockedBy: "worker_test",
          status: "active",
        }),
        where: expect.objectContaining({ id: "job_1", status: "queued" }),
      }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job_1", attempts: 1 }),
      "worker_test",
    );
  });

  it("requeues a failed attempt with bounded exponential backoff", async () => {
    const { updateMany, worker } = createWorker({
      processError: new Error("provider timeout"),
    });

    await worker.runOnce();

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: "provider timeout",
          lockedAt: null,
          lockedBy: null,
          status: "queued",
        }),
        where: expect.objectContaining({
          id: "job_1",
          lockedBy: "worker_test",
        }),
      }),
    );
  });

  it("dead-letters a job after its final bounded attempt", async () => {
    const { updateMany, worker } = createWorker({
      attempts: 3,
      processError: new Error("connector unavailable"),
    });

    await worker.runOnce();

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: "connector unavailable",
          status: "dead_lettered",
        }),
      }),
    );
  });

  it("uses capped exponential retry delays", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(20)).toBe(60_000);
  });
});
