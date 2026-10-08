import { sha256 } from "./hash";
import type {
  ConnectorPolicyResult,
  EvidenceExtractionResult,
  FetchResult,
  NormalizedDocument,
} from "./types";

export function allowedPolicy(): ConnectorPolicyResult {
  return {
    allowed: true,
    policyStatus: "allowed",
  };
}

export function withContentHash(result: FetchResult): FetchResult {
  return {
    ...result,
    contentHash: result.contentHash || sha256(result.rawText),
  };
}

export function defaultNormalize(result: FetchResult): NormalizedDocument {
  return {
    contentHash: result.contentHash,
    metadata: {
      contentType: result.contentType,
      retrievedAt: result.retrievedAt,
    },
    sourceIdentifier: result.sourceIdentifier,
    sourceType: result.sourceType,
    sourceUrl: result.sourceUrl,
    text: stripHtml(result.rawText),
  };
}

export function extractSummaryEvidence(document: NormalizedDocument): EvidenceExtractionResult[] {
  const compact = document.text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return [];
  }

  return [
    {
      confidenceScore: 0.72,
      evidenceSummary: compact.slice(0, 800),
      freshnessScore: 0.8,
      metadata: {
        title: document.title ?? null,
      },
    },
  ];
}

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
