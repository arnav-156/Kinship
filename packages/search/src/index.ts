export type SearchModality = "keyword" | "vector" | "metadata" | "entity";

export interface EvidenceSearchQuery {
  filters?: {
    entityIds?: string[];
    sourceTypes?: string[];
  };
  limit?: number;
  query: string;
  tenantId: string;
  workspaceId: string;
}

export interface EvidenceSearchResult {
  confidenceScore: number;
  entityId?: string;
  evidenceId: string;
  freshnessScore: number;
  rankScore: number;
  reasons: string[];
  sourceType?: string;
  summary: string;
}

export interface EvidenceSearchProvider {
  searchEvidence(query: EvidenceSearchQuery): Promise<EvidenceSearchResult[]>;
}

export interface EvidenceRetrievalCandidate {
  confidenceScore: number;
  entityId?: string;
  evidenceId: string;
  evidenceSummary: string;
  freshnessScore: number;
  lexicalRank?: number;
  lexicalScore?: number;
  metadataScore?: number;
  retrievalTimestamp?: Date | string;
  semanticRank?: number;
  semanticScore?: number;
  sourceType?: string;
}

export interface RankEvidenceOptions {
  confidenceWeight?: number;
  freshnessWeight?: number;
  lexicalWeight?: number;
  metadataWeight?: number;
  reciprocalRankConstant?: number;
  semanticWeight?: number;
}

export interface EntityResolutionInput {
  employerName?: string;
  fullName?: string;
  githubLogin?: string;
  linkedinUrl?: string;
  location?: string;
  organizationDomain?: string;
  orcidId?: string;
  primaryEmailHash?: string;
  profileUrls?: string[];
}

export interface EntityResolutionCandidate {
  aliases?: string[];
  canonicalName: string;
  entityId: string;
  githubLogin?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  organizationDomain?: string | null;
  orcidId?: string | null;
  primaryEmailHash?: string | null;
  type: "person" | "organization" | "other";
}

export type EntityResolutionSignalType =
  | "exact_email_hash"
  | "exact_orcid"
  | "exact_github"
  | "exact_profile_url"
  | "exact_domain"
  | "name_alias"
  | "name_location"
  | "name_employer"
  | "name_similarity"
  | "llm_suggestion";

export interface EntityResolutionSignal {
  description: string;
  score: number;
  type: EntityResolutionSignalType;
}

export interface EntityResolutionResult {
  candidate: EntityResolutionCandidate;
  decision: "match" | "review" | "new_entity";
  score: number;
  signals: EntityResolutionSignal[];
}

export interface RetrievalContextCard {
  confidenceScore: number;
  evidenceId: string;
  rankScore: number;
  sourceType?: string;
  summary: string;
}

const DEFAULT_RANKING_WEIGHTS: Required<RankEvidenceOptions> = {
  confidenceWeight: 0.25,
  freshnessWeight: 0.2,
  lexicalWeight: 0.3,
  metadataWeight: 0.1,
  reciprocalRankConstant: 60,
  semanticWeight: 0.15,
};

export function rankEvidenceCandidates(
  candidates: EvidenceRetrievalCandidate[],
  options: RankEvidenceOptions = {},
): EvidenceSearchResult[] {
  const weights = { ...DEFAULT_RANKING_WEIGHTS, ...options };
  const fusionModalityCount = candidates.some((candidate) => candidate.semanticRank !== undefined)
    ? 2
    : 1;
  return candidates
    .map((candidate) => {
      const freshnessScore = scoreFreshness(candidate.freshnessScore, candidate.retrievalTimestamp);
      const confidenceScore = clamp01(candidate.confidenceScore);
      const lexicalScore = clamp01(candidate.lexicalScore ?? 0);
      const metadataScore = clamp01(candidate.metadataScore ?? 0);
      const semanticScore = clamp01(candidate.semanticScore ?? 0);
      const hasRetrievalRanks =
        candidate.lexicalRank !== undefined || candidate.semanticRank !== undefined;
      const retrievalScore = hasRetrievalRanks
        ? reciprocalRankFusionScore(
            [candidate.lexicalRank, candidate.semanticRank],
            fusionModalityCount,
            weights.reciprocalRankConstant,
          )
        : undefined;
      const retrievalContribution = hasRetrievalRanks
        ? (retrievalScore ?? 0) * (weights.lexicalWeight + weights.semanticWeight)
        : lexicalScore * weights.lexicalWeight + semanticScore * weights.semanticWeight;
      const rankScore =
        retrievalContribution +
        metadataScore * weights.metadataWeight +
        freshnessScore * weights.freshnessWeight +
        confidenceScore * weights.confidenceWeight;

      return {
        confidenceScore,
        entityId: candidate.entityId,
        evidenceId: candidate.evidenceId,
        freshnessScore,
        rankScore: roundScore(rankScore),
        reasons: buildRankingReasons({
          confidenceScore,
          freshnessScore,
          lexicalScore,
          metadataScore,
          retrievalScore,
          semanticScore,
        }),
        sourceType: candidate.sourceType,
        summary: candidate.evidenceSummary,
      };
    })
    .sort((left, right) => right.rankScore - left.rankScore);
}

export function reciprocalRankFusionScore(
  ranks: Array<number | undefined>,
  modalityCount: number,
  constant = 60,
): number {
  if (!Number.isInteger(modalityCount) || modalityCount < 1) return 0;
  if (!Number.isFinite(constant) || constant < 0) return 0;

  const contribution = ranks.reduce<number>(
    (sum, rank) =>
      sum + (rank !== undefined && Number.isInteger(rank) && rank > 0 ? 1 / (constant + rank) : 0),
    0,
  );
  const maximum = modalityCount / (constant + 1);
  return roundScore(maximum > 0 ? contribution / maximum : 0);
}

export function scoreFreshness(
  existingFreshnessScore: number,
  retrievedAt?: Date | string,
): number {
  const supplied = clamp01(existingFreshnessScore);
  if (!retrievedAt) {
    return supplied;
  }

  const retrieved = new Date(retrievedAt).getTime();
  if (Number.isNaN(retrieved)) {
    return supplied;
  }

  const ageDays = Math.max(0, (Date.now() - retrieved) / 86_400_000);
  const recency = Math.exp(-ageDays / 365);
  return roundScore(Math.max(supplied, recency));
}

export function resolveEntityCandidates(
  input: EntityResolutionInput,
  candidates: EntityResolutionCandidate[],
): EntityResolutionResult[] {
  return candidates
    .map((candidate) => scoreEntityCandidate(input, candidate))
    .sort((left, right) => right.score - left.score);
}

export function scoreEntityCandidate(
  input: EntityResolutionInput,
  candidate: EntityResolutionCandidate,
): EntityResolutionResult {
  const signals: EntityResolutionSignal[] = [];
  addExactSignal(
    signals,
    "exact_email_hash",
    input.primaryEmailHash,
    candidate.primaryEmailHash,
    1,
  );
  addExactSignal(signals, "exact_orcid", input.orcidId, candidate.orcidId, 0.98);
  addExactSignal(signals, "exact_github", input.githubLogin, candidate.githubLogin, 0.94);
  addExactSignal(
    signals,
    "exact_domain",
    input.organizationDomain,
    candidate.organizationDomain,
    0.9,
  );

  const candidateProfileUrls = [candidate.linkedinUrl]
    .filter((value): value is string => Boolean(value))
    .map((url) => normalizeUrl(url));
  if (input.profileUrls?.some((url) => candidateProfileUrls.includes(normalizeUrl(url)))) {
    signals.push({
      description: "Exact profile URL match",
      score: 0.92,
      type: "exact_profile_url",
    });
  }

  const nameScore = bestNameSimilarity(input.fullName, [
    candidate.canonicalName,
    ...(candidate.aliases ?? []),
  ]);
  if (nameScore >= 0.92) {
    signals.push({
      description: "Exact or near-exact name/alias match",
      score: 0.72,
      type: "name_alias",
    });
  } else if (nameScore >= 0.74) {
    signals.push({
      description: "Similar name match",
      score: 0.28,
      type: "name_similarity",
    });
  }

  if (nameScore >= 0.72 && sameNormalized(input.location, candidate.location)) {
    signals.push({
      description: "Name and location align",
      score: 0.48,
      type: "name_location",
    });
  }

  if (
    nameScore >= 0.72 &&
    input.employerName &&
    candidate.aliases?.some((alias) => sameNormalized(alias, input.employerName))
  ) {
    signals.push({
      description: "Name and employer evidence align",
      score: 0.5,
      type: "name_employer",
    });
  }

  const score = roundScore(
    clamp01(1 - signals.reduce((miss, signal) => miss * (1 - signal.score), 1)),
  );
  const hasStrongDeterministicSignal = signals.some(
    (signal) =>
      signal.type === "exact_email_hash" ||
      signal.type === "exact_orcid" ||
      signal.type === "exact_github" ||
      signal.type === "exact_profile_url" ||
      signal.type === "exact_domain",
  );
  const decision =
    hasStrongDeterministicSignal && score >= 0.9
      ? "match"
      : score >= 0.62
        ? "review"
        : "new_entity";

  return {
    candidate,
    decision,
    score,
    signals,
  };
}

export function buildRetrievalContext(
  results: EvidenceSearchResult[],
  options: { maxCards?: number; minRankScore?: number } = {},
): RetrievalContextCard[] {
  const maxCards = options.maxCards ?? 8;
  const minRankScore = options.minRankScore ?? 0.2;
  return results
    .filter((result) => result.rankScore >= minRankScore)
    .slice(0, maxCards)
    .map((result) => ({
      confidenceScore: result.confidenceScore,
      evidenceId: result.evidenceId,
      rankScore: result.rankScore,
      sourceType: result.sourceType,
      summary: result.summary,
    }));
}

export function lexicalMatchScore(query: string, text: string): number {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return 0;
  }

  const textTerms = new Set(tokenize(text));
  const matches = queryTerms.filter((term) => textTerms.has(term)).length;
  return roundScore(matches / queryTerms.length);
}

function addExactSignal(
  signals: EntityResolutionSignal[],
  type: EntityResolutionSignalType,
  inputValue: string | undefined,
  candidateValue: string | null | undefined,
  score: number,
): void {
  if (sameNormalized(inputValue, candidateValue)) {
    signals.push({
      description: `${type.replace(/_/g, " ")} match`,
      score,
      type,
    });
  }
}

function bestNameSimilarity(inputName: string | undefined, candidateNames: string[]): number {
  if (!inputName) {
    return 0;
  }

  return Math.max(
    0,
    ...candidateNames.map((candidateName) => stringSimilarity(inputName, candidateName)),
  );
}

function stringSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return roundScore(intersection / union.size);
}

function sameNormalized(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return Boolean(left && right && normalizeText(left) === normalizeText(right));
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return normalizeText(value);
  }
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .replace(/[^a-z0-9\s@._-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function buildRankingReasons(scores: {
  confidenceScore: number;
  freshnessScore: number;
  lexicalScore: number;
  metadataScore: number;
  retrievalScore?: number;
  semanticScore: number;
}): string[] {
  const reasons = [];
  if (scores.lexicalScore > 0) {
    reasons.push("keyword match");
  }
  if (scores.semanticScore > 0) {
    reasons.push("semantic similarity");
  }
  if (scores.retrievalScore !== undefined) {
    reasons.push("reciprocal rank fusion");
  }
  if (scores.metadataScore > 0) {
    reasons.push("metadata match");
  }
  if (scores.freshnessScore >= 0.7) {
    reasons.push("fresh evidence");
  }
  if (scores.confidenceScore >= 0.75) {
    reasons.push("high confidence evidence");
  }

  return reasons.length > 0 ? reasons : ["baseline evidence quality"];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(clamp01(value) * 1000) / 1000;
}

export * from "./identity-review";
export * from "./relevance-evaluation";
