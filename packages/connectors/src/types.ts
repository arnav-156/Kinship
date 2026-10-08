import type { SourceType } from "@relationship/shared";

export interface FetchRequest {
  context?: Record<string, string | undefined>;
  sourceIdentifier: string;
  tenantId: string;
  timeoutMs: number;
  workspaceId: string;
}

export interface ConnectorPolicyResult {
  allowed: boolean;
  policyStatus: "allowed" | "warn" | "blocked";
  reason?: string;
}

export interface FetchResult {
  contentHash: string;
  contentType: string;
  rawText: string;
  retrievedAt: string;
  sourceIdentifier: string;
  sourceType: SourceType;
  sourceUrl?: string;
}

export interface NormalizedDocument {
  contentHash: string;
  metadata: Record<string, string | number | boolean | null>;
  sourceIdentifier: string;
  sourceType: SourceType;
  sourceUrl?: string;
  text: string;
  title?: string;
}

export interface EvidenceExtractionResult {
  confidenceScore: number;
  evidenceSummary: string;
  freshnessScore: number;
  metadata: Record<string, string | number | boolean | null>;
}

export interface SourceConnector {
  readonly sourceType: SourceType;
  checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult>;
  extractEvidence(document: NormalizedDocument): Promise<EvidenceExtractionResult[]>;
  fetch(request: FetchRequest): Promise<FetchResult>;
  normalize(result: FetchResult): Promise<NormalizedDocument>;
}

export interface HttpResponseLike {
  headers: {
    get(name: string): string | null;
  };
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<HttpResponseLike>;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;
