import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createModelGateway, type ModelGateway } from "../index";
import { parseAiGoldenSet, runAiGoldenSet } from "./index";

const suiteValue: unknown = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../fixtures/ai-golden-set.json"), "utf8"),
);

describe("AI golden-set runner", () => {
  it("runs the labeled suite against the deterministic provider", async () => {
    const report = await runAiGoldenSet(suiteValue, createModelGateway({ provider: "mock" }), {
      model: "mock-relationship-model",
      now: tickingClock(10),
      provider: "mock",
    });

    expect(report).toMatchObject({
      caseCount: 4,
      failedCaseCount: 0,
      passed: true,
      suiteId: "relationship-ai-golden-v1",
    });
    expect(report.metrics).toMatchObject({
      citationPrecision: 1,
      citationRecall: 1,
      groundedness: 1,
      p95LatencyMs: 10,
      unsupportedClaimRate: 0,
    });
    expect(report.metrics.totalInputTokens).toBeGreaterThan(0);
    expect(report.metrics.totalOutputTokens).toBeGreaterThan(0);
    expect(report.metrics.totalEstimatedCostUsd).toBeGreaterThan(0);
    expect(report.suiteDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("produces repeatable quality and cost results with an injected clock", async () => {
    const first = await runAiGoldenSet(suiteValue, createModelGateway({ provider: "mock" }), {
      now: tickingClock(5),
    });
    const second = await runAiGoldenSet(suiteValue, createModelGateway({ provider: "mock" }), {
      now: tickingClock(5),
    });

    expect(second).toEqual(first);
  });

  it("detects a claim that cites unknown evidence", async () => {
    const suite = parseAiGoldenSet(suiteValue);
    suite.cases = [suite.cases[0]!];
    const gateway: ModelGateway = {
      embedText: async () => ({
        dimensions: 1,
        embedding: [0],
        model: "test",
        provider: "test",
      }),
      generateStructured: async (request) =>
        request.schema.parse({
          channelRisk: "allowed",
          confidenceScore: 0.9,
          evidenceCards:
            suite.cases[0]?.task === "relationship_brief" ? suite.cases[0].input.evidenceCards : [],
          fitScore: 0.8,
          freshnessMetadata: { staleEvidenceIds: [] },
          outreachAngles: [
            {
              evidenceIds: ["missing_evidence"],
              label: "Invented award",
              rationale: "Ada won an international robotics award.",
            },
          ],
          recommendedChannel: "email",
          relationshipStage: "prospect",
          summary: "Invented output",
          warnings: [],
        }),
      generateText: async () => ({
        model: "test",
        outputText: "",
        provider: "test",
      }),
    };

    const report = await runAiGoldenSet(suite, gateway, { now: tickingClock(1) });

    expect(report.passed).toBe(false);
    expect(report.metrics).toMatchObject({
      citationPrecision: 0,
      groundedness: 0,
      unsupportedClaimRate: 1,
    });
    expect(report.cases[0]?.claims[0]?.reasons).toContain("Unknown evidence IDs: missing_evidence");
  });

  it("records provider failures as failed cases instead of aborting the suite", async () => {
    const failingGateway: ModelGateway = {
      embedText: async () => {
        throw new Error("provider unavailable");
      },
      generateStructured: async () => {
        throw new Error("provider unavailable");
      },
      generateText: async () => {
        throw new Error("provider unavailable");
      },
    };

    const report = await runAiGoldenSet(suiteValue, failingGateway, {
      now: tickingClock(25),
    });

    expect(report.failedCaseCount).toBe(4);
    expect(report.passed).toBe(false);
    expect(report.cases.every((item) => item.error === "provider unavailable")).toBe(true);
  });

  it("rejects incomplete labels and duplicate case IDs", () => {
    const incomplete = structuredClone(suiteValue) as {
      cases: Array<{
        input: {
          evidenceCards: Array<{ evidenceId: string }>;
        };
        caseId: string;
        expectations: { supportedFacts: unknown[] };
      }>;
    };
    const firstCase = incomplete.cases[0];
    const firstEvidence = firstCase?.input.evidenceCards[0];
    if (firstCase && firstEvidence) {
      firstCase.input.evidenceCards.push({
        ...structuredClone(firstEvidence),
        evidenceId: "unlabeled_evidence",
      });
    }
    expect(() => parseAiGoldenSet(incomplete)).toThrow(/exactly one supported-fact label/);

    const duplicate = structuredClone(suiteValue) as {
      cases: Array<{ caseId: string }>;
    };
    if (duplicate.cases[0] && duplicate.cases[1]) {
      duplicate.cases[1].caseId = duplicate.cases[0].caseId;
    }
    expect(() => parseAiGoldenSet(duplicate)).toThrow(/Duplicate caseId/);
  });
});

function tickingClock(elapsedPerCall: number): () => number {
  let value = 0;
  return () => {
    const current = value;
    value += elapsedPerCall;
    return current;
  };
}
