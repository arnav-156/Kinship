import { createModelGateway } from "@relationship/ai";
import { describe, expect, it, vi } from "vitest";

import { BriefGenerationProcessor } from "./brief-generation.processor";

describe("BriefGenerationProcessor", () => {
  it("records provider failure evidence before returning the job to retry handling", async () => {
    const aiRunCreate = vi.fn().mockResolvedValue({ id: "ai_run_failed" });
    const prisma = {
      aiRun: { create: aiRunCreate },
      backgroundJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      entity: {
        findFirst: vi.fn().mockResolvedValue({
          canonicalName: "Ada Lovelace",
          id: "entity_1",
        }),
      },
      evidenceItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            confidenceScore: 0.92,
            evidenceSummary: "Ada maintains a public analytical-engine repository.",
            freshnessScore: 0.88,
            id: "evidence_1",
            sourceType: "github",
          },
        ]),
      },
    };
    const processor = new BriefGenerationProcessor(
      prisma as never,
      {
        generateStructured: vi.fn().mockRejectedValue(new Error("provider timeout")),
      } as never,
    );

    await expect(
      processor.process(
        {
          id: "job_1",
          payload: {
            goal: "research collaboration",
            requestedByUserId: "user_1",
            subjectEntityId: "entity_1",
            tenantId: "tenant_1",
            workspaceId: "workspace_1",
          },
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        } as never,
        "worker_test",
      ),
    ).rejects.toThrow("provider timeout");

    expect(aiRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          error: "provider timeout",
          jobId: "job_1",
        }),
        purpose: "relationship_brief.generate",
        status: "failed",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
  });

  it("generates a scoped brief and atomically completes the leased job", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const relationshipBriefCreate = vi.fn().mockResolvedValue({ id: "brief_1" });
    const aiRunCreate = vi.fn().mockResolvedValue({ id: "ai_run_1" });
    const auditEventCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      aiRun: { create: aiRunCreate },
      auditEvent: { create: auditEventCreate },
      backgroundJob: { updateMany },
      entity: {
        findFirst: vi.fn().mockResolvedValue({
          canonicalName: "Ada Lovelace",
          id: "entity_1",
        }),
      },
      evidenceItem: {
        findMany: vi.fn().mockResolvedValue([
          {
            confidenceScore: 0.92,
            evidenceSummary: "Ada maintains a public analytical-engine repository.",
            freshnessScore: 0.88,
            id: "evidence_1",
            sourceType: "github",
          },
        ]),
      },
      relationshipBrief: { create: relationshipBriefCreate },
    };
    const processor = new BriefGenerationProcessor(
      prisma as never,
      createModelGateway({ provider: "mock" }),
    );

    await processor.process(
      {
        attempts: 1,
        id: "job_1",
        maxAttempts: 3,
        payload: {
          goal: "research collaboration",
          requestedByUserId: "user_1",
          subjectEntityId: "entity_1",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        queueName: "brief-generation",
        status: "active",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      } as never,
      "worker_test",
    );

    expect(relationshipBriefCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        goal: "research collaboration",
        subjectEntityId: "entity_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
    expect(aiRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "relationship_brief.generate",
        status: "succeeded",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        completedAt: expect.any(Date),
        lockedAt: null,
        lockedBy: null,
        progress: {
          briefId: "brief_1",
          evidenceItemCount: 1,
          percent: 100,
          stage: "completed",
        },
        status: "completed",
      }),
      where: {
        id: "job_1",
        lockedBy: "worker_test",
        status: "active",
      },
    });
    expect(auditEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user_1",
        eventType: "relationship_brief.generated",
        subjectId: "brief_1",
      }),
    });
  });
});
