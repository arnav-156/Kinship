import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createIdentityReviewLedger,
  createIdentityReviewReport,
  mergeReviewedIdentity,
  parseIdentityReviewCase,
  splitReviewedIdentity,
  verifyIdentityReviewLedger,
  type IdentityReviewLedger,
} from "./index";

const reviewCase = parseIdentityReviewCase(
  JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../fixtures/identity-review-case.json"), "utf8"),
  ),
);

describe("identity-resolution review utility", () => {
  it("produces candidate explanations while requiring a human decision", () => {
    const report = createIdentityReviewReport(reviewCase);
    const match = report.candidates.find(
      (candidate) => candidate.candidate.entityId === "entity_ada",
    );
    const separate = report.candidates.find(
      (candidate) => candidate.candidate.entityId === "entity_grace",
    );

    expect(match).toMatchObject({ decision: "match", requiresHumanDecision: true });
    expect(match?.evidence.map((signal) => signal.type)).toContain("exact_github");
    expect(match?.evidence.find((signal) => signal.type === "exact_github")?.category).toBe(
      "deterministic",
    );
    expect(separate).toMatchObject({ decision: "new_entity", requiresHumanDecision: true });
    expect(separate?.cautions).toContain("No strong deterministic identifier matched");
  });

  it("records and verifies a human merge followed by a split", () => {
    const report = createIdentityReviewReport(reviewCase);
    const initial = createLedger();
    const merged = mergeReviewedIdentity(initial, report, "entity_ada", {
      actorId: "reviewer_1",
      performedAt: "2026-07-01T12:00:00.000Z",
      reason: "GitHub identifier and name agree",
    });

    expect(merged.assignments.entity_import).toBe("entity_ada");
    expect(merged.audit[0]).toMatchObject({
      actorId: "reviewer_1",
      operation: "merge",
      review: { caseId: "case_ada_import" },
    });
    expect(verifyIdentityReviewLedger(merged)).toMatchObject({ eventCount: 1, valid: true });

    const split = splitReviewedIdentity(merged, "entity_import", {
      actorId: "reviewer_2",
      performedAt: "2026-07-01T12:10:00.000Z",
      reason: "Reviewer found conflicting source evidence",
    });
    expect(split.assignments.entity_import).toBe("entity_import");
    expect(split.audit[1]?.previousEventHash).toBe(split.audit[0]?.eventHash);
    expect(verifyIdentityReviewLedger(split)).toMatchObject({ eventCount: 2, valid: true });
  });

  it("detects audit tampering", () => {
    const merged = mergeReviewedIdentity(
      createLedger(),
      createIdentityReviewReport(reviewCase),
      "entity_ada",
      {
        actorId: "reviewer_1",
        performedAt: "2026-07-01T12:00:00.000Z",
        reason: "Reviewed merge",
      },
    );
    const tampered = structuredClone(merged);
    const event = tampered.audit[0];
    if (!event) {
      throw new Error("Expected merge audit event");
    }
    event.reason = "Changed after approval";
    expect(() => verifyIdentityReviewLedger(tampered)).toThrow(/hash does not match/);
  });

  it("rejects cross-workspace and new-entity merges", () => {
    const report = createIdentityReviewReport(reviewCase);
    const wrongScope = structuredClone(report);
    wrongScope.workspaceId = "workspace_other";
    expect(() =>
      mergeReviewedIdentity(createLedger(), wrongScope, "entity_ada", decision()),
    ).toThrow(/scopes do not match/);
    expect(() => mergeReviewedIdentity(createLedger(), report, "entity_grace", decision())).toThrow(
      /new-entity recommendation/,
    );
  });
});

function createLedger(): IdentityReviewLedger {
  return createIdentityReviewLedger(
    { tenantId: reviewCase.tenantId, workspaceId: reviewCase.workspaceId },
    [reviewCase.subjectEntityId, ...reviewCase.candidates.map((candidate) => candidate.entityId)],
  );
}

function decision() {
  return {
    actorId: "reviewer_1",
    performedAt: "2026-07-01T12:00:00.000Z",
    reason: "Reviewed decision",
  };
}
