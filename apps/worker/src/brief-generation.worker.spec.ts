import { describe, expect, it, vi } from "vitest";

import { BriefGenerationWorker } from "./brief-generation.worker";

const queuedJob = {
  attempts: 0,
  availableAt: new Date("2026-07-15T12:00:00.000Z"),
  id: "job_brief_1",
  maxAttempts: 3,
  payload: {
    goal: "research collaboration",
    requestedByUserId: "user_1",
    subjectEntityId: "entity_1",
    tenantId: "tenant_1",
    workspaceId: "workspace_1",
  },
  queueName: "brief-generation",
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
  const process = options.processError
    ? vi.fn().mockRejectedValue(options.processError)
    : vi.fn().mockResolvedValue(undefined);
  const prisma = {
    auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    backgroundJob: {
      findFirst: vi.fn().mockResolvedValue(queuedJob),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(claimedJob),
      updateMany,
    },
  };
  const worker = new BriefGenerationWorker(prisma as never, { process } as never, {
    concurrency: 1,
    leaseMs: 30_000,
    pollIntervalMs: 1_000,
    workerId: "worker_test",
  });
  return { prisma, process, updateMany, worker };
}

describe("BriefGenerationWorker", () => {
  it("claims a queued brief job before passing it to the processor", async () => {
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
        where: expect.objectContaining({
          id: "job_brief_1",
          queueName: "brief-generation",
          status: "queued",
        }),
      }),
    );
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job_brief_1", attempts: 1 }),
      "worker_test",
    );
  });

  it("requeues a failed AI attempt with bounded backoff", async () => {
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
          progress: expect.objectContaining({ stage: "retry_scheduled" }),
          status: "queued",
        }),
        where: expect.objectContaining({
          id: "job_brief_1",
          lockedBy: "worker_test",
        }),
      }),
    );
  });

  it("dead-letters brief generation after its final attempt", async () => {
    const { updateMany, worker } = createWorker({
      attempts: 3,
      processError: new Error("provider unavailable"),
    });

    await worker.runOnce();

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: "provider unavailable",
          progress: expect.objectContaining({ stage: "dead_lettered" }),
          status: "dead_lettered",
        }),
      }),
    );
  });

  it("recovers an expired AI lease for retry after a worker restart", async () => {
    const { prisma, updateMany, worker } = createWorker();
    prisma.backgroundJob.findMany.mockResolvedValue([
      {
        ...queuedJob,
        attempts: 1,
        lockedAt: new Date("2026-07-15T11:00:00.000Z"),
        lockedBy: "terminated_worker",
        status: "active",
      },
    ]);

    await expect(worker.recoverExpiredLeases()).resolves.toBe(1);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lockedAt: null,
          lockedBy: null,
          progress: expect.objectContaining({ stage: "retry_scheduled" }),
          status: "queued",
        }),
        where: expect.objectContaining({
          id: "job_brief_1",
          lockedAt: new Date("2026-07-15T11:00:00.000Z"),
          status: "active",
        }),
      }),
    );
  });
});
