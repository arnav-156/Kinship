import { describe, expect, it, vi } from "vitest";

import { ConnectorRefreshScheduler } from "./connector-refresh-scheduler";

describe("ConnectorRefreshScheduler", () => {
  it("queues one scheduled sync when an enabled connector refresh is due", async () => {
    const now = new Date("2026-10-08T12:00:00.000Z");
    const scheduledFor = new Date("2026-10-08T11:00:00.000Z");
    const runCreate = vi.fn().mockResolvedValue({ id: "run_scheduled_1" });
    const jobCreate = vi.fn().mockResolvedValue({ id: "job_scheduled_1" });
    const auditCreate = vi.fn().mockResolvedValue({ id: "audit_scheduled_1" });
    const scheduler = new ConnectorRefreshScheduler(
      {
        $transaction: vi.fn(async (callback) =>
          callback({
            auditEvent: { create: auditCreate },
            backgroundJob: { create: jobCreate },
            connectorRun: { create: runCreate },
          }),
        ),
        connectorAccount: {
          findMany: vi.fn().mockResolvedValue([
            {
              createdAt: new Date("2026-10-01T00:00:00.000Z"),
              id: "connector_1",
              metadata: {
                refresh: {
                  configuredAt: "2026-10-08T10:00:00.000Z",
                  enabled: true,
                  intervalMinutes: 60,
                  sourceIdentifier: "https://github.com/example/project",
                  subjectName: "Example project",
                },
              },
              provider: "github",
              tenantId: "tenant_1",
              workspaceId: "workspace_1",
            },
          ]),
        },
        connectorRun: {
          findFirst: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-10-08T10:00:00.000Z"),
            status: "succeeded",
          }),
        },
      } as never,
      { intervalMs: 300_000, now: () => now },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      accountsScanned: 1,
      accountsSkipped: 0,
      jobsQueued: 1,
    });
    expect(runCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        connectorAccountId: "connector_1",
        metadata: {
          scheduledFor: scheduledFor.toISOString(),
          sourceIdentifier: "https://github.com/example/project",
          trigger: "scheduled",
        },
        provider: "github",
        status: "queued",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
      select: { id: true },
    });
    expect(jobCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: `connector-refresh:connector_1:${scheduledFor.toISOString()}`,
        jobName: "connector.sync",
        payload: expect.objectContaining({
          connectorAccountId: "connector_1",
          connectorRunId: "run_scheduled_1",
          provider: "github",
          sourceIdentifier: "https://github.com/example/project",
          tenantId: "tenant_1",
          trigger: "scheduled",
          workspaceId: "workspace_1",
        }),
        queueName: "connector-sync",
        status: "queued",
      }),
      select: { id: true },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: null,
        eventType: "connector_sync.queued",
        metadata: expect.objectContaining({ trigger: "scheduled" }),
      }),
    });
  });

  it("skips disabled, malformed, not-yet-due, and already-running refreshes", async () => {
    const connectorRun = { findFirst: vi.fn() };
    connectorRun.findFirst
      .mockResolvedValueOnce({
        createdAt: new Date("2026-10-08T11:30:00.000Z"),
        status: "succeeded",
      })
      .mockResolvedValueOnce({
        createdAt: new Date("2026-10-08T10:00:00.000Z"),
        status: "running",
      });
    const scheduler = new ConnectorRefreshScheduler(
      {
        connectorAccount: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              connector("disabled", { enabled: false }),
              connector("malformed", { enabled: true, intervalMinutes: 60 }),
              connector("future", refresh()),
              connector("running", refresh()),
            ]),
        },
        connectorRun,
      } as never,
      { intervalMs: 300_000, now: () => new Date("2026-10-08T12:00:00.000Z") },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      accountsScanned: 4,
      accountsSkipped: 4,
      jobsQueued: 0,
    });
  });

  it("treats a concurrent scheduler's duplicate refresh key as already queued", async () => {
    const scheduler = new ConnectorRefreshScheduler(
      {
        $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
        connectorAccount: {
          findMany: vi.fn().mockResolvedValue([connector("connector_1", refresh())]),
        },
        connectorRun: {
          findFirst: vi.fn().mockResolvedValue({
            createdAt: new Date("2026-10-08T10:00:00.000Z"),
            status: "succeeded",
          }),
        },
      } as never,
      { intervalMs: 300_000, now: () => new Date("2026-10-08T12:00:00.000Z") },
    );

    await expect(scheduler.runOnce()).resolves.toEqual({
      accountsScanned: 1,
      accountsSkipped: 1,
      jobsQueued: 0,
    });
  });

  it("coalesces overlapping refresh scans", async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const findMany = vi.fn().mockImplementation(async () => {
      await waiting;
      return [];
    });
    const scheduler = new ConnectorRefreshScheduler({ connectorAccount: { findMany } } as never, {
      intervalMs: 300_000,
    });

    const first = scheduler.runOnce();
    const second = scheduler.runOnce();
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { accountsScanned: 0, accountsSkipped: 0, jobsQueued: 0 },
      { accountsScanned: 0, accountsSkipped: 0, jobsQueued: 0 },
    ]);
    expect(findMany).toHaveBeenCalledOnce();
  });
});

function refresh(overrides: Record<string, unknown> = {}) {
  return {
    configuredAt: "2026-10-08T10:00:00.000Z",
    enabled: true,
    intervalMinutes: 60,
    sourceIdentifier: "https://github.com/example/project",
    ...overrides,
  };
}

function connector(id: string, configuration: Record<string, unknown>) {
  return {
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    id,
    metadata: { refresh: configuration },
    provider: "github",
    tenantId: "tenant_1",
    workspaceId: "workspace_1",
  };
}
