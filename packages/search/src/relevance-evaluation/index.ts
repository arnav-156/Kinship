import crypto from "node:crypto";

import {
  lexicalMatchScore,
  rankEvidenceCandidates,
  type EvidenceRetrievalCandidate,
} from "../index";

export type RelevanceGrade = 0 | 1 | 2 | 3;

export interface RelevanceEvaluationCandidate {
  confidenceScore: number;
  evidenceId: string;
  evidenceSummary: string;
  freshnessScore: number;
  metadataScore?: number;
  searchText?: string;
  semanticScore?: number;
  sourceType?: string;
}

export interface RelevanceJudgment {
  evidenceId: string;
  grade: RelevanceGrade;
}

export interface LabeledRelevanceQuery {
  candidates: RelevanceEvaluationCandidate[];
  judgments: RelevanceJudgment[];
  query: string;
  queryId: string;
}

export interface RelevanceMetrics {
  hitRateAtK: number;
  meanReciprocalRank: number;
  ndcgAtK: number;
  precisionAtK: number;
  recallAtK: number;
}

export interface RelevanceDataset {
  cutoff: number;
  datasetId: string;
  description?: string;
  minimums?: Partial<RelevanceMetrics>;
  queries: LabeledRelevanceQuery[];
  schemaVersion: 1;
}

export interface RelevanceQueryReport {
  metrics: RelevanceMetrics;
  missedRelevantEvidenceIds: string[];
  query: string;
  queryId: string;
  rankedResults: Array<{
    evidenceId: string;
    grade: RelevanceGrade;
    rank: number;
    rankScore: number;
    reasons: string[];
  }>;
}

export interface RelevanceEvaluationReport {
  cutoff: number;
  datasetDigest: string;
  datasetId: string;
  metrics: RelevanceMetrics;
  minimums: Partial<RelevanceMetrics>;
  passed: boolean;
  queries: RelevanceQueryReport[];
  queryCount: number;
  schemaVersion: 1;
  thresholdChecks: Array<{
    actual: number;
    metric: keyof RelevanceMetrics;
    minimum: number;
    passed: boolean;
  }>;
}

export interface RelevanceEvaluationOptions {
  cutoff?: number;
  minimums?: Partial<RelevanceMetrics>;
}

const metricNames: Array<keyof RelevanceMetrics> = [
  "hitRateAtK",
  "meanReciprocalRank",
  "ndcgAtK",
  "precisionAtK",
  "recallAtK",
];

export function evaluateRelevanceDataset(
  value: unknown,
  options: RelevanceEvaluationOptions = {},
): RelevanceEvaluationReport {
  const dataset = parseRelevanceDataset(value);
  const cutoff = options.cutoff ?? dataset.cutoff;
  requirePositiveInteger(cutoff, "cutoff");
  for (const query of dataset.queries) {
    if (query.candidates.length < cutoff) {
      throw new RelevanceEvaluationError(
        `Query ${query.queryId} has fewer candidates than cutoff ${cutoff}`,
      );
    }
  }

  const minimums = {
    ...dataset.minimums,
    ...options.minimums,
  };
  validateMinimums(minimums);
  const queries = dataset.queries.map((query) => evaluateQuery(query, cutoff));
  const metrics = averageMetrics(queries.map((query) => query.metrics));
  const thresholdChecks = metricNames.flatMap((metric) => {
    const minimum = minimums[metric];
    return minimum === undefined
      ? []
      : [
          {
            actual: metrics[metric],
            metric,
            minimum,
            passed: metrics[metric] >= minimum,
          },
        ];
  });

  return {
    cutoff,
    datasetDigest: hashValue(stableStringify(dataset)),
    datasetId: dataset.datasetId,
    metrics,
    minimums,
    passed: thresholdChecks.every((check) => check.passed),
    queries,
    queryCount: queries.length,
    schemaVersion: 1,
    thresholdChecks,
  };
}

export function computeRelevanceMetrics(input: {
  allGrades: RelevanceGrade[];
  cutoff: number;
  rankedGrades: RelevanceGrade[];
}): RelevanceMetrics {
  requirePositiveInteger(input.cutoff, "cutoff");
  if (input.rankedGrades.length < input.cutoff) {
    throw new RelevanceEvaluationError("rankedGrades must contain at least cutoff entries");
  }
  const relevantCount = input.allGrades.filter((grade) => grade > 0).length;
  if (relevantCount === 0) {
    throw new RelevanceEvaluationError("Metrics require at least one relevant judgment");
  }
  const topGrades = input.rankedGrades.slice(0, input.cutoff);
  const relevantAtK = topGrades.filter((grade) => grade > 0).length;
  const firstRelevantIndex = input.rankedGrades.findIndex((grade) => grade > 0);
  const idealGrades = [...input.allGrades].sort((left, right) => right - left);
  const idealDcg = discountedCumulativeGain(idealGrades.slice(0, input.cutoff));
  const actualDcg = discountedCumulativeGain(topGrades);

  return {
    hitRateAtK: relevantAtK > 0 ? 1 : 0,
    meanReciprocalRank: firstRelevantIndex >= 0 ? roundMetric(1 / (firstRelevantIndex + 1)) : 0,
    ndcgAtK: idealDcg > 0 ? roundMetric(actualDcg / idealDcg) : 0,
    precisionAtK: roundMetric(relevantAtK / input.cutoff),
    recallAtK: roundMetric(relevantAtK / relevantCount),
  };
}

export function parseRelevanceDataset(value: unknown): RelevanceDataset {
  const dataset = requireRecord(value, "Relevance dataset") as unknown as RelevanceDataset;
  if (dataset.schemaVersion !== 1) {
    throw new RelevanceEvaluationError("Relevance dataset schemaVersion must be 1");
  }
  requireText(dataset.datasetId, "datasetId");
  if (dataset.description !== undefined) {
    requireText(dataset.description, "description");
  }
  requirePositiveInteger(dataset.cutoff, "cutoff");
  validateMinimums(dataset.minimums ?? {});
  if (!Array.isArray(dataset.queries) || dataset.queries.length === 0) {
    throw new RelevanceEvaluationError("Relevance dataset requires at least one query");
  }

  const queryIds = new Set<string>();
  for (const query of dataset.queries) {
    requireRecord(query, "query");
    requireText(query.queryId, "queryId");
    requireText(query.query, `query ${query.queryId}`);
    if (queryIds.has(query.queryId)) {
      throw new RelevanceEvaluationError(`Duplicate queryId ${query.queryId}`);
    }
    queryIds.add(query.queryId);
    validateQuery(query, dataset.cutoff);
  }
  return structuredClone(dataset);
}

export function digestRelevanceDataset(value: unknown): string {
  return hashValue(stableStringify(parseRelevanceDataset(value)));
}

export class RelevanceEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelevanceEvaluationError";
  }
}

function evaluateQuery(query: LabeledRelevanceQuery, cutoff: number): RelevanceQueryReport {
  const judgmentByEvidenceId = new Map(
    query.judgments.map((judgment) => [judgment.evidenceId, judgment.grade]),
  );
  const lexicalRankByEvidenceId = rankByScore(query.candidates, (candidate) =>
    lexicalMatchScore(
      query.query,
      [candidate.evidenceSummary, candidate.searchText, candidate.sourceType]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const semanticRankByEvidenceId = rankByScore(
    query.candidates,
    (candidate) => candidate.semanticScore ?? 0,
  );
  const ranked = rankEvidenceCandidates(
    query.candidates.map((candidate): EvidenceRetrievalCandidate => {
      const searchableText = [candidate.evidenceSummary, candidate.searchText, candidate.sourceType]
        .filter(Boolean)
        .join(" ");
      return {
        confidenceScore: candidate.confidenceScore,
        evidenceId: candidate.evidenceId,
        evidenceSummary: candidate.evidenceSummary,
        freshnessScore: candidate.freshnessScore,
        lexicalRank: lexicalRankByEvidenceId.get(candidate.evidenceId),
        lexicalScore: lexicalMatchScore(query.query, searchableText),
        metadataScore: candidate.metadataScore,
        semanticRank: semanticRankByEvidenceId.get(candidate.evidenceId),
        semanticScore: candidate.semanticScore,
        sourceType: candidate.sourceType,
      };
    }),
  );
  const rankedGrades = ranked.map((result) => judgmentByEvidenceId.get(result.evidenceId) ?? 0);
  const allGrades = query.judgments.map((judgment) => judgment.grade);
  const topIds = new Set(ranked.slice(0, cutoff).map((result) => result.evidenceId));

  return {
    metrics: computeRelevanceMetrics({ allGrades, cutoff, rankedGrades }),
    missedRelevantEvidenceIds: query.judgments
      .filter((judgment) => judgment.grade > 0 && !topIds.has(judgment.evidenceId))
      .map((judgment) => judgment.evidenceId),
    query: query.query,
    queryId: query.queryId,
    rankedResults: ranked.slice(0, cutoff).map((result, index) => ({
      evidenceId: result.evidenceId,
      grade: judgmentByEvidenceId.get(result.evidenceId) ?? 0,
      rank: index + 1,
      rankScore: result.rankScore,
      reasons: result.reasons,
    })),
  };
}

function rankByScore(
  candidates: RelevanceEvaluationCandidate[],
  score: (candidate: RelevanceEvaluationCandidate) => number,
): Map<string, number> {
  return new Map(
    candidates
      .map((candidate) => ({ candidate, score: score(candidate) }))
      .filter((item) => item.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.candidate.evidenceId.localeCompare(right.candidate.evidenceId),
      )
      .map((item, index) => [item.candidate.evidenceId, index + 1]),
  );
}

function validateQuery(query: LabeledRelevanceQuery, cutoff: number): void {
  if (!Array.isArray(query.candidates) || query.candidates.length < cutoff) {
    throw new RelevanceEvaluationError(
      `Query ${query.queryId} requires at least ${cutoff} candidates`,
    );
  }
  if (!Array.isArray(query.judgments)) {
    throw new RelevanceEvaluationError(`Query ${query.queryId} judgments must be an array`);
  }

  const candidateIds = new Set<string>();
  for (const candidate of query.candidates) {
    requireRecord(candidate, `candidate in ${query.queryId}`);
    requireText(candidate.evidenceId, "candidate.evidenceId");
    requireText(candidate.evidenceSummary, "candidate.evidenceSummary");
    if (candidateIds.has(candidate.evidenceId)) {
      throw new RelevanceEvaluationError(
        `Query ${query.queryId} has duplicate candidate ${candidate.evidenceId}`,
      );
    }
    candidateIds.add(candidate.evidenceId);
    requireScore(candidate.confidenceScore, `${candidate.evidenceId}.confidenceScore`);
    requireScore(candidate.freshnessScore, `${candidate.evidenceId}.freshnessScore`);
    if (candidate.metadataScore !== undefined) {
      requireScore(candidate.metadataScore, `${candidate.evidenceId}.metadataScore`);
    }
    if (candidate.semanticScore !== undefined) {
      requireScore(candidate.semanticScore, `${candidate.evidenceId}.semanticScore`);
    }
    if (candidate.searchText !== undefined) {
      requireText(candidate.searchText, `${candidate.evidenceId}.searchText`);
    }
    if (candidate.sourceType !== undefined) {
      requireText(candidate.sourceType, `${candidate.evidenceId}.sourceType`);
    }
  }

  const judgmentIds = new Set<string>();
  for (const judgment of query.judgments) {
    requireRecord(judgment, `judgment in ${query.queryId}`);
    requireText(judgment.evidenceId, "judgment.evidenceId");
    if (judgmentIds.has(judgment.evidenceId)) {
      throw new RelevanceEvaluationError(
        `Query ${query.queryId} has duplicate judgment ${judgment.evidenceId}`,
      );
    }
    judgmentIds.add(judgment.evidenceId);
    if (![0, 1, 2, 3].includes(judgment.grade)) {
      throw new RelevanceEvaluationError(
        `Judgment ${judgment.evidenceId} grade must be an integer from 0 to 3`,
      );
    }
  }

  const missingJudgments = [...candidateIds].filter((id) => !judgmentIds.has(id));
  const unknownJudgments = [...judgmentIds].filter((id) => !candidateIds.has(id));
  if (missingJudgments.length > 0 || unknownJudgments.length > 0) {
    throw new RelevanceEvaluationError(
      `Query ${query.queryId} must have exactly one judgment per candidate`,
    );
  }
  if (!query.judgments.some((judgment) => judgment.grade > 0)) {
    throw new RelevanceEvaluationError(`Query ${query.queryId} needs a relevant judgment`);
  }
}

function validateMinimums(minimums: Partial<RelevanceMetrics>): void {
  const record = requireRecord(minimums, "minimums");
  for (const [name, value] of Object.entries(record)) {
    if (!metricNames.includes(name as keyof RelevanceMetrics)) {
      throw new RelevanceEvaluationError(`Unknown minimum metric ${name}`);
    }
    requireScore(value, `minimums.${name}`);
  }
}

function averageMetrics(metrics: RelevanceMetrics[]): RelevanceMetrics {
  return Object.fromEntries(
    metricNames.map((name) => [
      name,
      roundMetric(metrics.reduce((sum, item) => sum + item[name], 0) / metrics.length),
    ]),
  ) as unknown as RelevanceMetrics;
}

function discountedCumulativeGain(grades: RelevanceGrade[]): number {
  return grades.reduce<number>(
    (total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RelevanceEvaluationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RelevanceEvaluationError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireScore(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RelevanceEvaluationError(`${label} must be a number from 0 to 1`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RelevanceEvaluationError(`${label} must be a positive integer`);
  }
  return value;
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
