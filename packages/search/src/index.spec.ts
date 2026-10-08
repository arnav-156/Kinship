import { describe, expect, it } from "vitest";

import {
  buildRetrievalContext,
  rankEvidenceCandidates,
  resolveEntityCandidates,
  scoreEntityCandidate,
} from "./index";

describe("rankEvidenceCandidates", () => {
  it("orders evidence by explainable retrieval and quality signals", () => {
    const results = rankEvidenceCandidates([
      {
        confidenceScore: 0.7,
        evidenceId: "old_low_keyword",
        evidenceSummary: "Backend engineer in robotics",
        freshnessScore: 0.4,
        lexicalScore: 0.2,
      },
      {
        confidenceScore: 0.9,
        evidenceId: "fresh_exact",
        evidenceSummary: "Arnav leads relationship intelligence work",
        freshnessScore: 0.8,
        lexicalScore: 1,
        metadataScore: 0.5,
      },
    ]);

    expect(results[0]?.evidenceId).toBe("fresh_exact");
    expect(results[0]?.reasons).toContain("keyword match");
    expect(results[0]?.reasons).toContain("high confidence evidence");
  });
});

describe("resolveEntityCandidates", () => {
  it("promotes exact deterministic identifiers to matches", () => {
    const results = resolveEntityCandidates(
      {
        fullName: "Ada Lovelace",
        githubLogin: "ada-l",
        orcidId: "0000-0001-2345-6789",
      },
      [
        {
          canonicalName: "Ada Lovelace",
          entityId: "entity_1",
          githubLogin: "ada-l",
          orcidId: "0000-0001-2345-6789",
          type: "person",
        },
      ],
    );

    expect(results[0]?.decision).toBe("match");
    expect(results[0]?.score).toBeGreaterThanOrEqual(0.99);
    expect(results[0]?.signals.map((signal) => signal.type)).toContain("exact_orcid");
  });

  it("keeps name-only similarity in review or new-entity territory", () => {
    const result = scoreEntityCandidate(
      {
        fullName: "Ada Lovelace",
      },
      {
        canonicalName: "Ada Byron Lovelace",
        entityId: "entity_1",
        type: "person",
      },
    );

    expect(result.decision).not.toBe("match");
  });
});

describe("buildRetrievalContext", () => {
  it("keeps only high-enough ranked citations for generation context", () => {
    const cards = buildRetrievalContext(
      [
        {
          confidenceScore: 0.9,
          evidenceId: "evidence_1",
          freshnessScore: 0.8,
          rankScore: 0.7,
          reasons: [],
          summary: "Strong citation",
        },
        {
          confidenceScore: 0.2,
          evidenceId: "evidence_2",
          freshnessScore: 0.2,
          rankScore: 0.05,
          reasons: [],
          summary: "Weak citation",
        },
      ],
      { minRankScore: 0.2 },
    );

    expect(cards).toEqual([
      {
        confidenceScore: 0.9,
        evidenceId: "evidence_1",
        rankScore: 0.7,
        sourceType: undefined,
        summary: "Strong citation",
      },
    ]);
  });
});
