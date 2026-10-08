import type { SourceType } from "@relationship/shared";

import { GenericPublicUrlConnector } from "./generic-url.connector";
import { GitHubConnector } from "./github.connector";
import { CsvImportConnector, ManualLinkedInContextConnector } from "./manual-connectors";
import {
  CrossrefConnector,
  OrcidConnector,
  SemanticScholarConnector,
} from "./public-api.connectors";
import type { SourceConnector } from "./types";

export function createDefaultConnectorRegistry(): Map<SourceType, SourceConnector> {
  return new Map<SourceType, SourceConnector>([
    ["company_website", new GenericPublicUrlConnector("company_website")],
    ["user_url", new GenericPublicUrlConnector("user_url")],
    ["github", new GitHubConnector()],
    ["orcid", new OrcidConnector()],
    ["semantic_scholar", new SemanticScholarConnector()],
    ["crossref", new CrossrefConnector()],
    ["csv_import", new CsvImportConnector()],
    ["manual_linkedin_context", new ManualLinkedInContextConnector()],
  ]);
}

export function getConnector(
  registry: Map<SourceType, SourceConnector>,
  sourceType: SourceType,
): SourceConnector {
  const connector = registry.get(sourceType);
  if (!connector) {
    throw new Error(`No connector registered for source type ${sourceType}`);
  }

  return connector;
}
