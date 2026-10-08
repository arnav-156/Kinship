import { describe, expect, it, vi } from "vitest";

import { RetentionScheduler } from "./retention-scheduler";

describe("RetentionScheduler", () => {
  it("queues one durable cleanup for an enabled workspace with expired evidence", async () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const expiredAt = new Date("2026-10-01T00:00:00.000Z");
    const create = vi.fn().mockResolvedValue({ id: "job_retention_1" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const scheduler = new RetentionScheduler(
      {
        $transaction: vi.fn(async (callback) =>
          callback({ auditEvent: { create: auditCreate }, backgroundJob: { create } }),
        ),
        backgroundJob: {
          create,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        evidenceItem: {
          findFirst: vi.fn().mockResolvedValue({ retentionExpiresAt: expiredAt }),
        },
        retentionPolicy: {
          findMany: vi.fn().mockResolvedValue([
            {
              dataClass: "evidence",
              enabled: true,
              tenantId: "tenant_1",
              workspaceId: "workspace_1",
            },
          ]),
        },
        sourceSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
        workspace: {
          findMany: vi.fn().mockResolvedValue([{ id: "workspace_1", tenantId: "tenant_1" }]),
        },
      } as never,
      { intervalMs: 300_000, now: () => now },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      jobsQueued: 1,
      policiesCreated: 0,
      policiesScanned: 1,
      workspacesSkipped: 0,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: `retention-cleanup:workspace_1:${expiredAt.toISOString()}`,
          jobName: "retention.cleanup",
          payload: {
            cutoffAt: now.toISOString(),
            dataClass: "evidence",
            tenantId: "tenant_1",
            trigger: "scheduled",
            workspaceId: "workspace_1",
          },
          queueName: "retention-cleanup",
          status: "queued",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
  });

  it("treats a concurrent scheduler's duplicate idempotency key as already queued", async () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const scheduler = new RetentionScheduler(
      {
        $transaction: vi.fn(async (callback) =>
          callback({ auditEvent: { create: vi.fn() }, backgroundJob: { create } }),
        ),
        auditEvent: { create: vi.fn() },
        backgroundJob: {
          create,
          findFirst: vi.fn().mockResolvedValue(null),
        },
        evidenceItem: {
          findFirst: vi.fn().mockResolvedValue({
            retentionExpiresAt: new Date("2026-10-01T00:00:00.000Z"),
          }),
        },
        retentionPolicy: {
          findMany: vi.fn().mockResolvedValue([
            {
              dataClass: "evidence",
              enabled: true,
              tenantId: "tenant_1",
              workspaceId: "workspace_1",
            },
          ]),
        },
        sourceSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
        workspace: {
          findMany: vi.fn().mockResolvedValue([{ id: "workspace_1", tenantId: "tenant_1" }]),
        },
      } as never,
      { intervalMs: 300_000, now: () => now },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      jobsQueued: 0,
      policiesCreated: 0,
      policiesScanned: 1,
      workspacesSkipped: 1,
    });
  });

  it("coalesces overlapping run requests", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const findMany = vi.fn().mockImplementation(async () => {
      await waiting;
      return [];
    });
    const scheduler = new RetentionScheduler(
      {
        retentionPolicy: { findMany },
        workspace: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      { intervalMs: 300_000 },
    );

    const first = scheduler.runOnce();
    const second = scheduler.runOnce();
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { jobsQueued: 0, policiesCreated: 0, policiesScanned: 0, workspacesSkipped: 0 },
      { jobsQueued: 0, policiesCreated: 0, policiesScanned: 0, workspacesSkipped: 0 },
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });

  it("creates and backfills the default evidence policy for a workspace that has none", async () => {
    const createdPolicy = {
      dataClass: "evidence",
      enabled: true,
      retentionDays: 365,
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    };
    const policyCreate = vi.fn().mockResolvedValue(createdPolicy);
    const executeRaw = vi.fn().mockResolvedValue(0);
    const scheduler = new RetentionScheduler(
      {
        $transaction: vi.fn(async (callback) =>
          callback({ $executeRaw: executeRaw, retentionPolicy: { create: policyCreate } }),
        ),
        backgroundJob: { findFirst: vi.fn().mockResolvedValue(null) },
        evidenceItem: { findFirst: vi.fn().mockResolvedValue(null) },
        retentionPolicy: { findMany: vi.fn().mockResolvedValue([]) },
        sourceSnapshot: { findFirst: vi.fn().mockResolvedValue(null) },
        workspace: {
          findMany: vi.fn().mockResolvedValue([{ id: "workspace_1", tenantId: "tenant_1" }]),
        },
      } as never,
      { intervalMs: 300_000 },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      jobsQueued: 0,
      policiesCreated: 1,
      policiesScanned: 1,
      workspacesSkipped: 1,
    });
    expect(policyCreate).toHaveBeenCalledWith({
      data: createdPolicy,
      select: expect.objectContaining({ workspaceId: true }),
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
});
