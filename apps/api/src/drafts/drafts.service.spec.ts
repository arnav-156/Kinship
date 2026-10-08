import { ForbiddenException, PreconditionFailedException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { DraftsService } from "./drafts.service";

const updatedAt = new Date("2026-07-13T10:00:00.000Z");
const member: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [{ role: "member", workspaceId: "workspace_1" }],
};

function draftFixture(overrides: Record<string, unknown> = {}) {
  return {
    body: "Hi Ada, your research looks relevant.",
    brief: {
      channelRisk: "warn",
      confidenceScore: 0.8,
      evidenceCards: [
        {
          confidenceScore: 0.9,
          evidenceId: "evidence_1",
          rankScore: 0.8,
          summary: "Ada published relevant research.",
        },
      ],
      fitScore: 0.8,
      freshnessMetadata: {},
      goal: "research collaboration",
      outreachAngles: [
        {
          evidenceIds: ["evidence_1"],
          label: "Research",
          rationale: "Ada published relevant research.",
        },
      ],
      recommendedChannel: "email",
      relationshipStage: "prospect",
      summary: "Relevant research profile",
      warnings: [],
    },
    briefId: "brief_1",
    channelType: "email",
    evidenceClaims: [{ evidenceIds: ["evidence_1"], text: "Relevant research" }],
    id: "draft_1",
    status: "needs_review",
    subjectEntity: { canonicalName: "Ada Lovelace" },
    subjectEntityId: "entity_1",
    tenantId: "tenant_1",
    tone: "warm professional",
    updatedAt,
    validationResult: {},
    variant: "warm_professional",
    workspaceId: "workspace_1",
    ...overrides,
  };
}

function transactionHarness(
  updated = draftFixture({ updatedAt: new Date("2026-07-13T10:01:00Z") }),
) {
  const tx = {
    draftMessage: {
      findUniqueOrThrow: vi.fn().mockResolvedValue(updated),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    draftMessageVersion: {
      create: vi.fn().mockResolvedValue({ id: "version_2" }),
      findFirst: vi.fn().mockResolvedValue({ version: 1 }),
    },
  };
  return tx;
}

describe("DraftsService", () => {
  it("allows workspace viewers to read but not update drafts", async () => {
    const viewer = {
      ...member,
      workspaceRoles: [{ role: "viewer" as const, workspaceId: "workspace_1" }],
    };
    const service = new DraftsService(
      { draftMessage: { findFirst: vi.fn().mockResolvedValue(draftFixture()) } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.get(viewer, "draft_1")).resolves.toMatchObject({ id: "draft_1" });
    await expect(
      service.update(viewer, "draft_1", {
        body: "Changed",
        expectedUpdatedAt: updatedAt.toISOString(),
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("persists an autosave with optimistic concurrency and a numbered snapshot", async () => {
    const tx = transactionHarness();
    const record = vi.fn().mockResolvedValue({ id: "audit_1" });
    const service = new DraftsService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        draftMessage: { findFirst: vi.fn().mockResolvedValue(draftFixture()) },
      } as never,
      {} as never,
      { record } as never,
      {} as never,
    );

    await service.update(member, "draft_1", {
      body: "Updated body",
      expectedUpdatedAt: updatedAt.toISOString(),
      reason: "autosave",
    });

    expect(tx.draftMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ body: "Updated body", status: "needs_review" }),
        where: expect.objectContaining({ updatedAt }),
      }),
    );
    expect(tx.draftMessageVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "autosave", version: 2 }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "draft_message.updated" }),
      tx,
    );
  });

  it("rejects stale writes before changing persisted state", async () => {
    const service = new DraftsService(
      { draftMessage: { findFirst: vi.fn().mockResolvedValue(draftFixture()) } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.update(member, "draft_1", {
        body: "Stale edit",
        expectedUpdatedAt: "2026-07-13T09:00:00.000Z",
      }),
    ).rejects.toThrow(PreconditionFailedException);
  });

  it("validates evidence references and compliance before marking a draft validated", async () => {
    const tx = transactionHarness(draftFixture({ status: "validated" }));
    const service = new DraftsService(
      {
        $transaction: vi.fn(async (callback) => callback(tx)),
        draftMessage: { findFirst: vi.fn().mockResolvedValue(draftFixture()) },
      } as never,
      {} as never,
      { record: vi.fn() } as never,
      {
        evaluateDraftChannel: vi.fn().mockResolvedValue({
          decision: "allowed",
          reason: "No deterministic block found",
          reviewRequired: false,
          warnings: [],
        }),
      } as never,
    );

    await service.validate(member, "draft_1", { expectedUpdatedAt: updatedAt.toISOString() });

    expect(tx.draftMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "validated",
          validationResult: expect.objectContaining({
            citedEvidenceIds: ["evidence_1"],
            manualReviewRequired: true,
            unsupportedClaims: [],
          }),
        }),
      }),
    );
  });
});
