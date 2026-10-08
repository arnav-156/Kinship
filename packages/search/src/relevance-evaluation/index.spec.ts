import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { computeRelevanceMetrics, evaluateRelevanceDataset, parseRelevanceDataset } from "./index";

const datasetValue: unknown = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../fixtures/search-relevance-labeled-queries.json"),
    "utf8",
  ),
);

describe("search relevance evaluation", () => {
  it("computes binary and graded ranking metrics", () => {
    expect(
      computeRelevanceMetrics({
        allGrades: [3, 1, 0],
        cutoff: 3,
        rankedGrades: [3, 0, 1],
      }),
    ).toEqual({
      hitRateAtK: 1,
      meanReciprocalRank: 1,
      ndcgAtK: 0.982842,
      precisionAtK: 0.666667,
      recallAtK: 1,
    });
  });

  it("evaluates the committed labeled set deterministically", () => {
    const first = evaluateRelevanceDataset(datasetValue);
    const second = evaluateRelevanceDataset(datasetValue);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      cutoff: 3,
      datasetId: "relationship-search-v1",
      passed: true,
      queryCount: 4,
    });
    expect(first.datasetDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.metrics.hitRateAtK).toBe(1);
    expect(first.metrics.recallAtK).toBe(1);
    expect(first.queries.every((query) => query.missedRelevantEvidenceIds.length === 0)).toBe(true);
  });

  it("fails a caller-supplied regression threshold without changing rankings", () => {
    const baseline = evaluateRelevanceDataset(datasetValue);
    const failed = evaluateRelevanceDataset(datasetValue, {
      minimums: { precisionAtK: 0.9 },
    });

    expect(failed.passed).toBe(false);
    expect(failed.queries).toEqual(baseline.queries);
    expect(failed.thresholdChecks).toContainEqual({
      actual: baseline.metrics.precisionAtK,
      metric: "precisionAtK",
      minimum: 0.9,
      passed: false,
    });
  });

  it("rejects partially labeled candidate pools", () => {
    const incomplete = structuredClone(datasetValue) as {
      queries: Array<{ judgments: unknown[] }>;
    };
    incomplete.queries[0]?.judgments.pop();

    expect(() => parseRelevanceDataset(incomplete)).toThrow(/exactly one judgment per candidate/);
  });

  it("rejects duplicate query identifiers and invalid grades", () => {
    const duplicate = structuredClone(datasetValue) as {
      queries: Array<{ judgments: Array<{ grade: number }>; queryId: string }>;
    };
    if (duplicate.queries[0] && duplicate.queries[1]) {
      duplicate.queries[1].queryId = duplicate.queries[0].queryId;
    }
    expect(() => parseRelevanceDataset(duplicate)).toThrow(/Duplicate queryId/);

    const invalidGrade = structuredClone(datasetValue) as {
      queries: Array<{ judgments: Array<{ grade: number }> }>;
    };
    if (invalidGrade.queries[0]?.judgments[0]) {
      invalidGrade.queries[0].judgments[0].grade = 4;
    }
    expect(() => parseRelevanceDataset(invalidGrade)).toThrow(/integer from 0 to 3/);
  });
});
