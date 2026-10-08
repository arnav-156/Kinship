import crypto from "node:crypto";

import { z } from "zod";

import {
  DraftMessageOutputSchema,
  EvidenceCardSchema,
  RelationshipBriefOutputSchema,
  generateDraftMessage,
  generateRelationshipBrief,
  renderDraftPrompt,
  renderRelationshipBriefPrompt,
  type EvidenceCard,
  type EvidenceClaim,
  type ModelGateway,
} from "../index";

const ScoreSchema = z.number().min(0).max(1);

const GoldenExpectationsSchema = z.object({
  forbiddenPhrases: z.array(z.string().min(1)).default([]),
  requiredEvidenceIds: z.array(z.string().min(1)).min(1),
  supportedFacts: z
    .array(
      z.object({
        evidenceId: z.string().min(1),
        keywords: z.array(z.string().min(2)).min(1),
      }),
    )
    .min(1),
});

const BriefGoldenCaseSchema = z.object({
  caseId: z.string().min(1),
  expectations: GoldenExpectationsSchema,
  input: z.object({
    evidenceCards: z.array(EvidenceCardSchema).min(1),
    goal: z.string().min(1),
    subjectName: z.string().min(1),
  }),
  task: z.literal("relationship_brief"),
});

const DraftGoldenCaseSchema = z.object({
  caseId: z.string().min(1),
  expectations: GoldenExpectationsSchema,
  input: z.object({
    brief: RelationshipBriefOutputSchema,
    goal: z.string().min(1),
    subjectName: z.string().min(1),
    variant: DraftMessageOutputSchema.shape.variant,
  }),
  task: z.literal("draft_message"),
});

export const AiGoldenSetSchema = z.object({
  cases: z
    .array(z.discriminatedUnion("task", [BriefGoldenCaseSchema, DraftGoldenCaseSchema]))
    .min(1),
  claimMatchMinimumKeywordRecall: ScoreSchema.default(0.5),
  description: z.string().min(1).optional(),
  pricing: z.object({
    assumptionId: z.string().min(1),
    inputUsdPerMillionTokens: z.number().min(0),
    outputUsdPerMillionTokens: z.number().min(0),
  }),
  schemaVersion: z.literal(1),
  suiteId: z.string().min(1),
  thresholds: z.object({
    maximumAverageCostUsd: z.number().min(0),
    maximumP95LatencyMs: z.number().min(0),
    maximumUnsupportedClaimRate: ScoreSchema,
    minimumCitationPrecision: ScoreSchema,
    minimumCitationRecall: ScoreSchema,
    minimumGroundedness: ScoreSchema,
  }),
});

export type AiGoldenSet = z.infer<typeof AiGoldenSetSchema>;
export type AiGoldenCase = AiGoldenSet["cases"][number];
export type AiGoldenThresholds = AiGoldenSet["thresholds"];

export interface AiGoldenQualityMetrics {
  citationPrecision: number;
  citationRecall: number;
  groundedness: number;
  unsupportedClaimRate: number;
}

export interface AiGoldenOperationalMetrics {
  averageEstimatedCostUsd: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  totalEstimatedCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface AiGoldenClaimEvaluation {
  evidenceIds: string[];
  grounded: boolean;
  reasons: string[];
  text: string;
}

export interface AiGoldenCaseReport {
  caseId: string;
  claims: AiGoldenClaimEvaluation[];
  error?: string;
  estimatedCostUsd: number;
  inputTokens: number;
  latencyMs: number;
  metrics: AiGoldenQualityMetrics;
  missingRequiredEvidenceIds: string[];
  outputDigest?: string;
  outputTokens: number;
  status: "failed" | "succeeded";
  task: AiGoldenCase["task"];
}

export interface AiGoldenSetReport {
  caseCount: number;
  cases: AiGoldenCaseReport[];
  failedCaseCount: number;
  metrics: AiGoldenOperationalMetrics & AiGoldenQualityMetrics;
  model: string;
  passed: boolean;
  pricingAssumptionId: string;
  provider: string;
  schemaVersion: 1;
  suiteDigest: string;
  suiteId: string;
  thresholdChecks: Array<{
    actual: number;
    metric: keyof AiGoldenThresholds;
    passed: boolean;
    threshold: number;
  }>;
  thresholds: AiGoldenThresholds;
}

export interface AiGoldenRunOptions {
  model?: string;
  now?: () => number;
  provider?: string;
  thresholds?: Partial<AiGoldenThresholds>;
}

interface CaseCounts {
  citationCount: number;
  citedRequiredCount: number;
  claimCount: number;
  groundedClaimCount: number;
  requiredCitationCount: number;
  unsupportedClaimCount: number;
  validCitationCount: number;
}

interface InternalCaseReport extends AiGoldenCaseReport {
  counts: CaseCounts;
}

export function parseAiGoldenSet(value: unknown): AiGoldenSet {
  const suite = AiGoldenSetSchema.parse(value);
  const caseIds = new Set<string>();
  for (const goldenCase of suite.cases) {
    if (caseIds.has(goldenCase.caseId)) {
      throw new AiGoldenSetError(`Duplicate caseId ${goldenCase.caseId}`);
    }
    caseIds.add(goldenCase.caseId);
    validateCaseLabels(goldenCase);
  }
  return suite;
}

export function digestAiGoldenSet(value: unknown): string {
  return hashValue(stableStringify(parseAiGoldenSet(value)));
}

export async function runAiGoldenSet(
  value: unknown,
  gateway: ModelGateway,
  options: AiGoldenRunOptions = {},
): Promise<AiGoldenSetReport> {
  const suite = parseAiGoldenSet(value);
  const thresholds = { ...suite.thresholds, ...options.thresholds };
  AiGoldenSetSchema.shape.thresholds.parse(thresholds);
  const now = options.now ?? Date.now;
  const internalCases: InternalCaseReport[] = [];
  for (const goldenCase of suite.cases) {
    internalCases.push(await runCase(suite, goldenCase, gateway, now));
  }

  const metrics = aggregateMetrics(internalCases);
  const thresholdChecks = createThresholdChecks(metrics, thresholds);
  const cases = internalCases.map(({ counts: _counts, ...report }) => report);
  return {
    caseCount: cases.length,
    cases,
    failedCaseCount: cases.filter((item) => item.status === "failed").length,
    metrics,
    model: options.model ?? "unspecified",
    passed:
      cases.every((item) => item.status === "succeeded") &&
      thresholdChecks.every((check) => check.passed),
    pricingAssumptionId: suite.pricing.assumptionId,
    provider: options.provider ?? "unspecified",
    schemaVersion: 1,
    suiteDigest: hashValue(stableStringify(suite)),
    suiteId: suite.suiteId,
    thresholdChecks,
    thresholds,
  };
}

export class AiGoldenSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGoldenSetError";
  }
}

async function runCase(
  suite: AiGoldenSet,
  goldenCase: AiGoldenCase,
  gateway: ModelGateway,
  now: () => number,
): Promise<InternalCaseReport> {
  const startedAt = now();
  const prompt =
    goldenCase.task === "relationship_brief"
      ? renderRelationshipBriefPrompt(goldenCase.input)
      : renderDraftPrompt(goldenCase.input);
  const inputTokens = estimateTokens(`${prompt.systemPrompt ?? ""}\n${prompt.prompt}`);

  try {
    let output: unknown;
    let claims: EvidenceClaim[];
    let explicitUnsupportedClaims: string[];
    if (goldenCase.task === "relationship_brief") {
      const brief = await generateRelationshipBrief(gateway, goldenCase.input);
      output = brief;
      claims = brief.outreachAngles.map((angle) => ({
        evidenceIds: angle.evidenceIds,
        text: angle.rationale,
      }));
      explicitUnsupportedClaims = brief.warnings
        .filter((warning) => warning.startsWith("Unsupported claim: "))
        .map((warning) => warning.slice("Unsupported claim: ".length));
    } else {
      const draft = await generateDraftMessage(gateway, goldenCase.input);
      output = draft;
      claims = draft.evidenceClaims;
      explicitUnsupportedClaims = draft.validationResult.unsupportedClaims;
    }

    const latencyMs = elapsedMs(startedAt, now());
    const outputText = stableStringify(output);
    const outputTokens = estimateTokens(outputText);
    const evidenceCards = evidenceForCase(goldenCase);
    const evaluated = evaluateClaims(
      claims,
      evidenceCards,
      goldenCase.expectations,
      suite.claimMatchMinimumKeywordRecall,
      explicitUnsupportedClaims,
    );

    return {
      caseId: goldenCase.caseId,
      claims: evaluated.claims,
      counts: evaluated.counts,
      estimatedCostUsd: estimateCost(suite, inputTokens, outputTokens),
      inputTokens,
      latencyMs,
      metrics: metricsFromCounts(evaluated.counts),
      missingRequiredEvidenceIds: evaluated.missingRequiredEvidenceIds,
      outputDigest: hashValue(outputText),
      outputTokens,
      status: "succeeded",
      task: goldenCase.task,
    };
  } catch (error) {
    const latencyMs = elapsedMs(startedAt, now());
    const counts: CaseCounts = {
      citationCount: 0,
      citedRequiredCount: 0,
      claimCount: 1,
      groundedClaimCount: 0,
      requiredCitationCount: goldenCase.expectations.requiredEvidenceIds.length,
      unsupportedClaimCount: 1,
      validCitationCount: 0,
    };
    return {
      caseId: goldenCase.caseId,
      claims: [],
      counts,
      error: error instanceof Error ? error.message : "Unknown generation failure",
      estimatedCostUsd: estimateCost(suite, inputTokens, 0),
      inputTokens,
      latencyMs,
      metrics: metricsFromCounts(counts),
      missingRequiredEvidenceIds: goldenCase.expectations.requiredEvidenceIds,
      outputTokens: 0,
      status: "failed",
      task: goldenCase.task,
    };
  }
}

function evaluateClaims(
  claims: EvidenceClaim[],
  evidenceCards: EvidenceCard[],
  expectations: AiGoldenCase["expectations"],
  minimumKeywordRecall: number,
  explicitUnsupportedClaims: string[],
): {
  claims: AiGoldenClaimEvaluation[];
  counts: CaseCounts;
  missingRequiredEvidenceIds: string[];
} {
  const allowedIds = new Set(evidenceCards.map((card) => card.evidenceId));
  const citedIds = new Set<string>();
  let citationCount = 0;
  let validCitationCount = 0;
  const normalizedExplicitUnsupported = new Set(explicitUnsupportedClaims.map(normalizeText));
  const claimEvaluations = claims.map((claim): AiGoldenClaimEvaluation => {
    const reasons: string[] = [];
    const uniqueEvidenceIds = [...new Set(claim.evidenceIds)];
    uniqueEvidenceIds.forEach((id) => citedIds.add(id));
    citationCount += uniqueEvidenceIds.length;
    validCitationCount += uniqueEvidenceIds.filter((id) => allowedIds.has(id)).length;
    const invalidIds = uniqueEvidenceIds.filter((id) => !allowedIds.has(id));
    if (invalidIds.length > 0) {
      reasons.push(`Unknown evidence IDs: ${invalidIds.join(", ")}`);
    }

    const forbidden = expectations.forbiddenPhrases.filter((phrase) =>
      normalizeText(claim.text).includes(normalizeText(phrase)),
    );
    if (forbidden.length > 0) {
      reasons.push(`Forbidden phrase matched: ${forbidden.join(", ")}`);
    }

    const supported = expectations.supportedFacts.some(
      (fact) =>
        uniqueEvidenceIds.includes(fact.evidenceId) &&
        keywordRecall(claim.text, fact.keywords) >= minimumKeywordRecall,
    );
    if (!supported) {
      reasons.push("Claim did not match a labeled fact for its cited evidence");
    }
    if (normalizedExplicitUnsupported.has(normalizeText(claim.text))) {
      reasons.push("Pipeline validation marked the claim unsupported");
    }

    return {
      evidenceIds: uniqueEvidenceIds,
      grounded: reasons.length === 0,
      reasons,
      text: claim.text,
    };
  });
  const evaluatedTexts = new Set(claims.map((claim) => normalizeText(claim.text)));
  const unmatchedExplicitUnsupported = [...normalizedExplicitUnsupported].filter(
    (claim) => !evaluatedTexts.has(claim),
  ).length;
  const missingRequiredEvidenceIds = expectations.requiredEvidenceIds.filter(
    (id) => !citedIds.has(id),
  );

  return {
    claims: claimEvaluations,
    counts: {
      citationCount,
      citedRequiredCount:
        expectations.requiredEvidenceIds.length - missingRequiredEvidenceIds.length,
      claimCount: claimEvaluations.length + unmatchedExplicitUnsupported,
      groundedClaimCount: claimEvaluations.filter((claim) => claim.grounded).length,
      requiredCitationCount: expectations.requiredEvidenceIds.length,
      unsupportedClaimCount:
        claimEvaluations.filter((claim) => !claim.grounded).length + unmatchedExplicitUnsupported,
      validCitationCount,
    },
    missingRequiredEvidenceIds,
  };
}

function validateCaseLabels(goldenCase: AiGoldenCase): void {
  const evidenceCards = evidenceForCase(goldenCase);
  const evidenceIds = evidenceCards.map((card) => card.evidenceId);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    throw new AiGoldenSetError(`Case ${goldenCase.caseId} has duplicate evidence IDs`);
  }
  const factIds = goldenCase.expectations.supportedFacts.map((fact) => fact.evidenceId);
  if (new Set(factIds).size !== factIds.length) {
    throw new AiGoldenSetError(`Case ${goldenCase.caseId} has duplicate supported-fact labels`);
  }
  if (
    factIds.length !== evidenceIds.length ||
    evidenceIds.some((id) => !factIds.includes(id)) ||
    factIds.some((id) => !evidenceIds.includes(id))
  ) {
    throw new AiGoldenSetError(
      `Case ${goldenCase.caseId} must have exactly one supported-fact label per evidence card`,
    );
  }
  const unknownRequired = goldenCase.expectations.requiredEvidenceIds.filter(
    (id) => !evidenceIds.includes(id),
  );
  if (unknownRequired.length > 0) {
    throw new AiGoldenSetError(
      `Case ${goldenCase.caseId} requires unknown evidence ${unknownRequired.join(", ")}`,
    );
  }
}

function evidenceForCase(goldenCase: AiGoldenCase): EvidenceCard[] {
  return goldenCase.task === "relationship_brief"
    ? goldenCase.input.evidenceCards
    : goldenCase.input.brief.evidenceCards;
}

function metricsFromCounts(counts: CaseCounts): AiGoldenQualityMetrics {
  return {
    citationPrecision: ratio(counts.validCitationCount, counts.citationCount),
    citationRecall: ratio(counts.citedRequiredCount, counts.requiredCitationCount),
    groundedness: ratio(counts.groundedClaimCount, counts.claimCount),
    unsupportedClaimRate: ratio(counts.unsupportedClaimCount, counts.claimCount),
  };
}

function aggregateMetrics(
  cases: InternalCaseReport[],
): AiGoldenOperationalMetrics & AiGoldenQualityMetrics {
  const counts = cases.reduce<CaseCounts>(
    (total, item) => ({
      citationCount: total.citationCount + item.counts.citationCount,
      citedRequiredCount: total.citedRequiredCount + item.counts.citedRequiredCount,
      claimCount: total.claimCount + item.counts.claimCount,
      groundedClaimCount: total.groundedClaimCount + item.counts.groundedClaimCount,
      requiredCitationCount: total.requiredCitationCount + item.counts.requiredCitationCount,
      unsupportedClaimCount: total.unsupportedClaimCount + item.counts.unsupportedClaimCount,
      validCitationCount: total.validCitationCount + item.counts.validCitationCount,
    }),
    {
      citationCount: 0,
      citedRequiredCount: 0,
      claimCount: 0,
      groundedClaimCount: 0,
      requiredCitationCount: 0,
      unsupportedClaimCount: 0,
      validCitationCount: 0,
    },
  );
  const latencies = cases.map((item) => item.latencyMs).sort((left, right) => left - right);
  const totalEstimatedCostUsd = cases.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  return {
    ...metricsFromCounts(counts),
    averageEstimatedCostUsd: roundCost(totalEstimatedCostUsd / cases.length),
    averageLatencyMs: roundMetric(
      latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length,
    ),
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    totalEstimatedCostUsd: roundCost(totalEstimatedCostUsd),
    totalInputTokens: cases.reduce((sum, item) => sum + item.inputTokens, 0),
    totalOutputTokens: cases.reduce((sum, item) => sum + item.outputTokens, 0),
  };
}

function createThresholdChecks(
  metrics: AiGoldenOperationalMetrics & AiGoldenQualityMetrics,
  thresholds: AiGoldenThresholds,
): AiGoldenSetReport["thresholdChecks"] {
  return [
    checkMinimum("minimumGroundedness", metrics.groundedness, thresholds.minimumGroundedness),
    checkMaximum(
      "maximumUnsupportedClaimRate",
      metrics.unsupportedClaimRate,
      thresholds.maximumUnsupportedClaimRate,
    ),
    checkMinimum(
      "minimumCitationPrecision",
      metrics.citationPrecision,
      thresholds.minimumCitationPrecision,
    ),
    checkMinimum("minimumCitationRecall", metrics.citationRecall, thresholds.minimumCitationRecall),
    checkMaximum("maximumP95LatencyMs", metrics.p95LatencyMs, thresholds.maximumP95LatencyMs),
    checkMaximum(
      "maximumAverageCostUsd",
      metrics.averageEstimatedCostUsd,
      thresholds.maximumAverageCostUsd,
    ),
  ];
}

function checkMinimum(
  metric: keyof AiGoldenThresholds,
  actual: number,
  threshold: number,
): AiGoldenSetReport["thresholdChecks"][number] {
  return { actual, metric, passed: actual >= threshold, threshold };
}

function checkMaximum(
  metric: keyof AiGoldenThresholds,
  actual: number,
  threshold: number,
): AiGoldenSetReport["thresholdChecks"][number] {
  return { actual, metric, passed: actual <= threshold, threshold };
}

function keywordRecall(text: string, keywords: string[]): number {
  const tokens = new Set(tokenize(text));
  const matches = keywords.filter((keyword) =>
    tokenize(keyword).every((token) => tokens.has(token)),
  ).length;
  return matches / keywords.length;
}

function estimateCost(suite: AiGoldenSet, inputTokens: number, outputTokens: number): number {
  return roundCost(
    (inputTokens / 1_000_000) * suite.pricing.inputUsdPerMillionTokens +
      (outputTokens / 1_000_000) * suite.pricing.outputUsdPerMillionTokens,
  );
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function elapsedMs(startedAt: number, finishedAt: number): number {
  return roundMetric(Math.max(0, finishedAt - startedAt));
}

function percentile(sortedValues: number[], fraction: number): number {
  const index = Math.max(0, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index] ?? 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : roundMetric(numerator / denominator);
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundCost(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}

function hashValue(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValue(child)]),
    );
  }
  return value;
}
