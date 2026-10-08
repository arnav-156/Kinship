import { allowedPolicy, defaultNormalize, extractSummaryEvidence, withContentHash } from "./base";
import { ConnectorPolicyError } from "./errors";
import type {
  ConnectorPolicyResult,
  EvidenceExtractionResult,
  FetchRequest,
  FetchResult,
  NormalizedDocument,
  SourceConnector,
} from "./types";

export class CsvImportConnector implements SourceConnector {
  readonly sourceType = "csv_import" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult> {
    if (!request.context?.csvText) {
      throw new ConnectorPolicyError("CSV import requires user-supplied csvText context");
    }

    return allowedPolicy();
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    await this.checkPolicy(request);
    return withContentHash({
      contentHash: "",
      contentType: "text/csv",
      rawText: request.context?.csvText ?? "",
      retrievedAt: this.now().toISOString(),
      sourceIdentifier: request.sourceIdentifier,
      sourceType: this.sourceType,
    });
  }

  async normalize(result: FetchResult): Promise<NormalizedDocument> {
    return defaultNormalize(result);
  }

  async extractEvidence(document: NormalizedDocument): Promise<EvidenceExtractionResult[]> {
    return extractSummaryEvidence(document);
  }
}

export class ManualLinkedInContextConnector implements SourceConnector {
  readonly sourceType = "manual_linkedin_context" as const;

  constructor(private readonly now: () => Date = () => new Date()) {}

  async checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult> {
    const url = new URL(request.sourceIdentifier);
    if (!["linkedin.com", "www.linkedin.com"].includes(url.hostname)) {
      throw new ConnectorPolicyError("Manual LinkedIn context must be a LinkedIn URL");
    }

    return {
      allowed: true,
      policyStatus: "warn",
      reason: "LinkedIn URL is stored only as user-provided context; no scraping is performed",
    };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    await this.checkPolicy(request);
    const suppliedContext = request.context?.manualText?.trim();
    return withContentHash({
      contentHash: "",
      contentType: "text/plain",
      rawText:
        suppliedContext ||
        `User provided LinkedIn URL as manual context. No LinkedIn content was fetched: ${request.sourceIdentifier}`,
      retrievedAt: this.now().toISOString(),
      sourceIdentifier: request.sourceIdentifier,
      sourceType: this.sourceType,
      sourceUrl: request.sourceIdentifier,
    });
  }

  async normalize(result: FetchResult): Promise<NormalizedDocument> {
    return defaultNormalize(result);
  }

  async extractEvidence(document: NormalizedDocument): Promise<EvidenceExtractionResult[]> {
    return extractSummaryEvidence(document);
  }
}
