import type { SourceConnector } from "@relationship/connectors";
import { describe, expect, it, vi } from "vitest";

import { ConnectorSyncProcessor } from "./connector-sync.processor";

describe("ConnectorSyncProcessor", () => {
  it("ingests connector evidence and atomically completes the run and leased job", async () => {
    const connector: SourceConnector = {
      sourceType: "github",
      checkPolicy: vi.fn().mockResolvedValue({ allowed: true, policyStatus: "allowed" }),
      fetch: vi.fn().mockResolvedValue({
        contentHash: "hash_1",
        contentType: "text/plain",
        rawText: "Public repository context",
        retrievedAt: "2026-10-08T10:00:00.000Z",
        sourceIdentifier: "https://github.com/example/project",
        sourceType: "github",
        sourceUrl: "https://github.com/example/project",
      }),
      normalize: vi.fn().mockResolvedValue({
        contentHash: "hash_1",
        metadata: {},
        sourceIdentifier: "https://github.com/example/project",
        sourceType: "github",
        text: "Public repository context",
      }),
      extractEvidence: vi.fn().mockResolvedValue([
        {
          confidenceScore: 0.9,
          evidenceSummary: "The project has recent public activity.",
          freshnessScore: 0.8,
          metadata: {},
        },
      ]),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const connectorRunUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
      backgroundJob: { updateMany },
      connectorAccount: {
        findFirst: vi.fn().mockResolvedValue({ id: "connector_1", provider: "github" }),
      },
      connectorRun: { updateMany: connectorRunUpdateMany },
      entity: { findFirst: vi.fn().mockResolvedValue({ id: "entity_1" }) },
      evidenceItem: { create: vi.fn().mockResolvedValue({ id: "evidence_1" }) },
      retentionPolicy: { findUnique: vi.fn().mockResolvedValue(null) },
      sourceSnapshot: { upsert: vi.fn().mockResolvedValue({ id: "snapshot_1" }) },
    };
    const processor = new ConnectorSyncProcessor(prisma as never, new Map([["github", connector]]));

    await processor.process(
      {
        attempts: 1,
        id: "job_sync_1",
        maxAttempts: 3,
        payload: {
          connectorAccountId: "connector_1",
          connectorRunId: "run_1",
          entityId: "entity_1",
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
      } as never,
      "worker_test",
    );

    expect(connectorRunUpdateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        failureReason: null,
        finishedAt: expect.any(Date),
        status: "succeeded",
      }),
      where: expect.objectContaining({ id: "run_1", tenantId: "tenant_1" }),
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        progress: expect.objectContaining({
          connectorRunId: "run_1",
          entityId: "entity_1",
          evidenceItemCount: 1,
          percent: 100,
        }),
        status: "completed",
      }),
      where: { id: "job_sync_1", lockedBy: "worker_test", status: "active" },
    });
  });

  it("marks the connector run failed when the final durable attempt fails", async () => {
    const connector: SourceConnector = {
      sourceType: "github",
      checkPolicy: vi.fn().mockResolvedValue({ allowed: true, policyStatus: "allowed" }),
      fetch: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      normalize: vi.fn(),
      extractEvidence: vi.fn(),
    };
    const connectorRunUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const processor = new ConnectorSyncProcessor(
      {
        backgroundJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        connectorAccount: {
          findFirst: vi.fn().mockResolvedValue({ id: "connector_1", provider: "github" }),
        },
        connectorRun: { updateMany: connectorRunUpdateMany },
      } as never,
      new Map([["github", connector]]),
    );

    await expect(
      processor.process(
        {
          attempts: 3,
          id: "job_sync_1",
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
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        } as never,
        "worker_test",
      ),
    ).rejects.toThrow("provider unavailable");

    expect(connectorRunUpdateMany).toHaveBeenLastCalledWith({
      data: {
        failureReason: "provider unavailable",
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
