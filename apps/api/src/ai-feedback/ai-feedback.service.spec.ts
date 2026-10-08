import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { AiFeedbackService } from "./ai-feedback.service";

const principal: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "member", workspaceId: "workspace_1" }],
};
const updatedAt = new Date("2026-07-14T12:00:00.000Z");

function brief() {
  return {
    channelRisk: "warn",
    confidenceScore: 0.82,
    evidenceCards: [],
    fitScore: 0.76,
    freshnessMetadata: {},
    id: "brief_1",
    outreachAngles: [],
    recommendedChannel: "email",
    relationshipStage: "prospect",
    summary: "A grounded brief",
    tenantId: "tenant_1",
    updatedAt,
    warnings: [],
    workspaceId: "workspace_1",
  };
}

describe("AiFeedbackService", () => {
  it("upserts snapshot feedback, links the current AI run, and records an audit event", async () => {
    const feedback = { id: "feedback_1", rating: "helpful", reason: "well_grounded" };
    const upsert = vi.fn().mockResolvedValue(feedback);
    const record = vi.fn().mockResolvedValue({ id: "audit_1" });
    const tx = { aiQualityFeedback: { upsert } };
    const findAiRun = vi.fn().mockResolvedValue({ id: "run_1" });
    const service = new AiFeedbackService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        aiRun: { findFirst: findAiRun },
        relationshipBrief: { findFirst: vi.fn().mockResolvedValue(brief()) },
      } as never,
      { record } as never,
    );

    const result = await service.submit(principal, {
      comment: "The evidence links were useful.",
      rating: "helpful",
      reason: "well_grounded",
      targetId: "brief_1",
      targetType: "brief",
    });

    expect(findAiRun).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: updatedAt },
          metadata: { equals: "brief_1", path: ["briefId"] },
          tenantId: "tenant_1",
        }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          aiRunId: "run_1",
          briefId: "brief_1",
          submittedById: "user_1",
          targetType: "brief",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "ai_quality_feedback.submitted",
        metadata: expect.objectContaining({ aiRunId: "run_1", rating: "helpful" }),
      }),
      tx,
    );
    expect(result).toMatchObject({ current: feedback, stale: false });
  });

  it("reports prior feedback as stale after the target output changes", async () => {
    const service = new AiFeedbackService(
      {
        aiQualityFeedback: {
          findFirst: vi.fn().mockResolvedValue({ id: "feedback_old" }),
          findUnique: vi.fn().mockResolvedValue(null),
        },
        relationshipBrief: { findFirst: vi.fn().mockResolvedValue(brief()) },
      } as never,
      {} as never,
    );

    const result = await service.get(principal, { targetId: "brief_1", targetType: "brief" });

    expect(result).toMatchObject({ current: null, stale: true });
  });

  it("rejects reasons that do not match the selected rating", async () => {
    const service = new AiFeedbackService(
      {
        relationshipBrief: { findFirst: vi.fn().mockResolvedValue(brief()) },
      } as never,
      {} as never,
    );

    await expect(
      service.submit(principal, {
        rating: "helpful",
        reason: "inaccurate",
        targetId: "brief_1",
        targetType: "brief",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("does not reveal targets from another tenant", async () => {
    const service = new AiFeedbackService(
      { relationshipBrief: { findFirst: vi.fn().mockResolvedValue(null) } } as never,
      {} as never,
    );

    await expect(
      service.get(principal, { targetId: "brief_other", targetType: "brief" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("requires workspace membership even when a target exists", async () => {
    const outsider = { ...principal, workspaceRoles: [] };
    const service = new AiFeedbackService(
      { relationshipBrief: { findFirst: vi.fn().mockResolvedValue(brief()) } } as never,
      {} as never,
    );

    await expect(
      service.get(outsider, { targetId: "brief_1", targetType: "brief" }),
    ).rejects.toThrow(ForbiddenException);
  });
});
