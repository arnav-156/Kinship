import type { SourceType } from "@relationship/shared";

import { defaultNormalize, extractSummaryEvidence, withContentHash } from "./base";
import { safeFetchText, type SafeFetchOptions } from "./http";
import { assertSafePublicUrl } from "./safe-url";
import type {
  ConnectorPolicyResult,
  EvidenceExtractionResult,
  FetchRequest,
  FetchResult,
  NormalizedDocument,
  SourceConnector,
} from "./types";

export class GenericPublicUrlConnector implements SourceConnector {
  readonly sourceType: SourceType;

  constructor(
    sourceType: Extract<SourceType, "company_website" | "user_url"> = "user_url",
    private readonly options: Partial<Omit<SafeFetchOptions, "sourceType" | "timeoutMs">> = {},
  ) {
    this.sourceType = sourceType;
  }

  async checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult> {
    await assertSafePublicUrl(request.sourceIdentifier, this.options.resolver);
    return {
      allowed: true,
      policyStatus: "allowed",
    };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    await this.checkPolicy(request);
    return withContentHash(
      await safeFetchText(request.sourceIdentifier, {
        ...this.options,
        sourceType: this.sourceType,
        timeoutMs: request.timeoutMs,
      }),
    );
  }

  async normalize(result: FetchResult): Promise<NormalizedDocument> {
    return defaultNormalize(result);
  }

  async extractEvidence(document: NormalizedDocument): Promise<EvidenceExtractionResult[]> {
    return extractSummaryEvidence(document);
  }
}
