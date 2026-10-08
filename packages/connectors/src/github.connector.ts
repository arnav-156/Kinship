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

export class GitHubConnector implements SourceConnector {
  readonly sourceType = "github" as const;

  constructor(
    private readonly options: Partial<Omit<SafeFetchOptions, "sourceType" | "timeoutMs">> = {},
  ) {}

  async checkPolicy(request: FetchRequest): Promise<ConnectorPolicyResult> {
    toGitHubApiUrl(request.sourceIdentifier);
    return {
      allowed: true,
      policyStatus: "allowed",
    };
  }

  async fetch(request: FetchRequest): Promise<FetchResult> {
    const apiUrl = toGitHubApiUrl(request.sourceIdentifier);
    return withContentHash(
      await safeFetchText(apiUrl, {
        ...this.options,
        sourceType: this.sourceType,
        timeoutMs: request.timeoutMs,
      }),
    );
  }

  async normalize(result: FetchResult): Promise<NormalizedDocument> {
    const document = defaultNormalize(result);
    try {
      const parsed = JSON.parse(result.rawText) as {
        description?: string;
        full_name?: string;
        html_url?: string;
        language?: string;
        stargazers_count?: number;
      };
      return {
        ...document,
        metadata: {
          language: parsed.language ?? null,
          stars: parsed.stargazers_count ?? null,
        },
        sourceUrl: parsed.html_url ?? document.sourceUrl,
        text: [
          parsed.full_name,
          parsed.description,
          parsed.language ? `Language: ${parsed.language}` : undefined,
        ]
          .filter(Boolean)
          .join(". "),
        title: parsed.full_name,
      };
    } catch {
      return document;
    }
  }

  async extractEvidence(document: NormalizedDocument): Promise<EvidenceExtractionResult[]> {
    return extractSummaryEvidence(document);
  }
}

function toGitHubApiUrl(input: string): string {
  const url = new URL(input);
  if (url.hostname !== "github.com") {
    throw new ConnectorPolicyError("GitHub connector only accepts github.com repository URLs");
  }

  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) {
    throw new ConnectorPolicyError("GitHub repository URL must include owner and repository");
  }

  return `https://api.github.com/repos/${owner}/${repo}`;
}
