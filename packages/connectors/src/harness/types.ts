import type { SourceType } from "@relationship/shared";

import type {
  ConnectorPolicyResult,
  EvidenceExtractionResult,
  FetchRequest,
  FetchResult,
  NormalizedDocument,
  ResolvedAddress,
} from "../types";

export interface ConnectorFixture {
  expected: {
    evidenceCount: number;
    policyStatus: ConnectorPolicyResult["policyStatus"];
    replayDigest: string;
  };
  name: string;
  recording: {
    dns?: Record<string, ResolvedAddress[]>;
    http?: {
      requestUrl: string;
      response: {
        body: string;
        headers: Record<string, string>;
        status: number;
      };
    };
    recordedAt: string;
  };
  request: FetchRequest;
  schemaVersion: 1;
  scope: {
    allowedContextKeys: string[];
    allowedHosts: string[];
    tenantId: string;
    workspaceId: string;
  };
  sourceType: SourceType;
}

export interface ReplaySnapshot {
  document: NormalizedDocument;
  evidence: EvidenceExtractionResult[];
  fetch: FetchResult;
  policy: ConnectorPolicyResult;
}

export interface ReplayResult {
  digest: string;
  evidenceCount: number;
  fixtureName: string;
  snapshot: ReplaySnapshot;
  sourceType: SourceType;
}

export class ConnectorFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorFixtureError";
  }
}
