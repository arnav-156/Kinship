import { createModelGateway } from "@relationship/ai";
import { describe, expect, it, vi } from "vitest";

import { DraftGenerationProcessor } from "./draft-generation.processor";

const storedBrief = {
  channelRisk: "allowed",
  confidenceScore: 0.91,
  evidenceCards: [
    {
      confidenceScore: 0.92,
      evidenceId: "evidence_1",
      rankScore: 0.9,
      sourceType: "github",
      summary: "Ada maintains a public analytical-engine repository.",
    },
  ],
  fitScore: 0.9,
  freshnessMetadata: { newestEvidenceId: "evidence_1", staleEvidenceIds: [] },
  goal: "research collaboration",
  id: "brief_1",
  outreachAngles: [
    {
      evidenceIds: ["evidence_1"],
      label: "Evidence-backed relevance",
      rationale: "Ada has a relevant public research signal.",
    },
  ],
  recommendedChannel: "email",
  relationshipStage: "prospect",
  subjectEntity: { canonicalName: "Ada Lovelace" },
  subjectEntityId: "entity_1",
  summary: "Ada appears relevant to the collaboration goal.",
  tenantId: "tenant_1",
  warnings: [],
  workspaceId: "workspace_1",
};

const activeJob = {
  attempts: 1,
  id: "job_draft_1",
  maxAttempts: 3,
  payload: {
    briefId: "brief_1",
    requestedByUserId: "user_1",
    tenantId: "tenant_1",
    variant: "concise",
    workspaceId: "workspace_1",
  },
  queueName: "draft-generation",
  status: "active",
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

describe("DraftGenerationProcessor", () => {
  it("generates a compliant draft and atomically completes the leased job", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const draftMessageCreate = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        ...data,
        id: "draft_1",
        updatedAt: new Date("2026-10-07T00:00:00.000Z"),
      }),
    );
    const draftMessageVersionCreate = vi.fn().mockResolvedValue({ id: "draft_version_1" });
    const aiRunCreate = vi.fn().mockResolvedValue({ id: "ai_run_1" });
    const auditEventCreate = vi.fn().mockResolvedValue({ id: "audit_1" });
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      aiRun: { create: aiRunCreate },
      auditEvent: { create: auditEventCreate },
      backgroundJob: { updateMany },
      contactChannel: { findFirst: vi.fn().mockResolvedValue(null) },
      draftMessage: { create: draftMessageCreate },
      draftMessageVersion: { create: draftMessageVersionCreate },
      relationshipBrief: { findFirst: vi.fn().mockResolvedValue(storedBrief) },
      suppressionEntry: { findFirst: vi.fn() },
    };
    const processor = new DraftGenerationProcessor(
      prisma as never,
      createModelGateway({ provider: "mock" }),
    );

    await processor.process(activeJob as never, "worker_test");

    expect(draftMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        briefId: "brief_1",
        status: "needs_review",
        subjectEntityId: "entity_1",
        tenantId: "tenant_1",
        variant: "concise",
        workspaceId: "workspace_1",
      }),
    });
    expect(draftMessageVersionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        createdById: "user_1",
        draftId: "draft_1",
        reason: "generated",
        version: 1,
      }),
    });
    expect(aiRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        purpose: "draft_message.generate",
        status: "succeeded",
      }),
    });
    expect(updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        completedAt: expect.any(Date),
        progress: {
          briefId: "brief_1",
          draftId: "draft_1",
          percent: 100,
          stage: "completed",
        },
        status: "completed",
      }),
      where: { id: "job_draft_1", lockedBy: "worker_test", status: "active" },
    });
    expect(auditEventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "user_1",
        eventType: "draft_message.generated",
        subjectId: "draft_1",
      }),
    });
  });

  it("blocks the persisted draft when workspace or tenant suppression matches the channel", async () => {
    const draftMessageCreate = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...data, id: "draft_blocked" }));
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
      aiRun: { create: vi.fn().mockResolvedValue({ id: "ai_run_1" }) },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
      backgroundJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      contactChannel: {
        findFirst: vi.fn().mockResolvedValue({
          consentStatus: "confirmed",
          purpose: "outreach_review",
          recipientRegion: "US",
          recipientType: "professional",
          valueHash: "email_hash",
        }),
      },
      draftMessage: { create: draftMessageCreate },
      draftMessageVersion: { create: vi.fn().mockResolvedValue({ id: "version_1" }) },
      relationshipBrief: { findFirst: vi.fn().mockResolvedValue(storedBrief) },
      suppressionEntry: { findFirst: vi.fn().mockResolvedValue({ id: "suppression_1" }) },
    };
    const processor = new DraftGenerationProcessor(
      prisma as never,
      createModelGateway({ provider: "mock" }),
    );

    await processor.process(activeJob as never, "worker_test");

    expect(prisma.suppressionEntry.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        OR: [{ workspaceId: "workspace_1" }, { workspaceId: null }],
        tenantId: "tenant_1",
        valueHash: "email_hash",
      }),
    });
    expect(draftMessageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "blocked",
        validationResult: expect.objectContaining({
          blockedReasons: expect.arrayContaining(["Recipient or channel is suppressed"]),
          compliance: expect.objectContaining({ decision: "blocked" }),
        }),
      }),
    });
  });

  it("records provider failure evidence before returning the job to retry handling", async () => {
    const aiRunCreate = vi.fn().mockResolvedValue({ id: "ai_run_failed" });
    const prisma = {
      aiRun: { create: aiRunCreate },
      backgroundJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      relationshipBrief: { findFirst: vi.fn().mockResolvedValue(storedBrief) },
    };
    const processor = new DraftGenerationProcessor(
      prisma as never,
      { generateStructured: vi.fn().mockRejectedValue(new Error("provider timeout")) } as never,
    );

    await expect(processor.process(activeJob as never, "worker_test")).rejects.toThrow(
      "provider timeout",
    );

    expect(aiRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          error: "provider timeout",
          jobId: "job_draft_1",
        }),
        purpose: "draft_message.generate",
        status: "failed",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    });
  });
});
