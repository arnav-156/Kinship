import { defaultNormalize, extractSummaryEvidence, withContentHash } from "./base";
import { ConnectorPolicyError } from "./errors";
import { safeFetchText, type SafeFetchOptions } from "./http";
import type {
  ConnectorPolicyResult,
  EvidenceExtractionResult,
  FetchRequest,
  FetchResult,
  NormalizedDocument,
  SourceConnector,
} from "./types";

abstract class PublicApiConnector implements SourceConnector {
  abstract readonly sourceType: "crossref" | "orcid" | "semantic_scholar";

  constructor(
    private readonly options: Partial<Omit<SafeFetchOptions, "sourceType" | "timeoutMs">> = {},
  ) {}

  async checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult> {
    this.toApiUrl(request.sourceIdentifier);
    return {
      allowed: true,
      policyStatus: "allowed",
    };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    return withContentHash(
      await safeFetchText(this.toApiUrl(request.sourceIdentifier), {
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

  protected abstract toApiUrl(identifier: string): string;
}

export class OrcidConnector extends PublicApiConnector {
  readonly sourceType = "orcid" as const;

  protected toApiUrl(identifier: string): string {
    const orcid = identifier.match(/\d{4}-\d{4}-\d{4}-[\dX]{4}/i)?.[0];
    if (!orcid) {
      throw new ConnectorPolicyError("ORCID connector requires an ORCID identifier");
    }

    return `https://pub.orcid.org/v3.0/${orcid}/record`;
  }
}

export class SemanticScholarConnector extends PublicApiConnector {
  readonly sourceType = "semantic_scholar" as const;

  protected toApiUrl(identifier: string): string {
    const trimmed = identifier.trim();
    if (!trimmed) {
      throw new ConnectorPolicyError("Semantic Scholar connector requires a paper identifier");
    }

    return `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(
      trimmed,
    )}?fields=title,abstract,authors,year,url`;
  }
}

export class CrossrefConnector extends PublicApiConnector {
  readonly sourceType = "crossref" as const;

  protected toApiUrl(identifier: string): string {
    const doi = identifier.replace(/^https:\/\/doi\.org\//i, "").trim();
    if (!doi || !doi.includes("/")) {
      throw new ConnectorPolicyError("Crossref connector requires a DOI");
    }

    return `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  }
}
