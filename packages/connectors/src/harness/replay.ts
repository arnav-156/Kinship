import type { SourceType } from "@relationship/shared";

import { GenericPublicUrlConnector } from "../generic-url.connector";
import { GitHubConnector } from "../github.connector";
import { sha256 } from "../hash";
import type { SafeFetchOptions } from "../http";
import { CsvImportConnector, ManualLinkedInContextConnector } from "../manual-connectors";
import {
  CrossrefConnector,
  OrcidConnector,
  SemanticScholarConnector,
} from "../public-api.connectors";
import type { DnsResolver, FetchLike, HttpResponseLike, SourceConnector } from "../types";
import { validateConnectorFixture } from "./fixture";
import type { ConnectorFixture, ReplayResult, ReplaySnapshot } from "./types";
import { ConnectorFixtureError } from "./types";

export async function replayConnectorFixture(
  fixtureValue: ConnectorFixture,
  options: { verifyExpected?: boolean } = {},
): Promise<ReplayResult> {
  const fixture = validateConnectorFixture(fixtureValue, fixtureValue.name || "fixture");
  const clock = () => new Date(fixture.recording.recordedAt);
  const calls = { fetch: 0 };
  const connector = createReplayConnector(fixture, clock, calls);
  const policy = await connector.checkPolicy(fixture.request);
  const fetch = await connector.fetch(fixture.request);
  const document = await connector.normalize(fetch);
  const evidence = await connector.extractEvidence(document);
  const expectedFetchCalls = fixture.recording.http ? 1 : 0;
  if (calls.fetch !== expectedFetchCalls) {
    throw new ConnectorFixtureError(
      `${fixture.name}: replay made ${calls.fetch} HTTP calls; expected ${expectedFetchCalls}`,
    );
  }

  const snapshot: ReplaySnapshot = { document, evidence, fetch, policy };
  const digest = sha256(stableStringify(snapshot));
  const result: ReplayResult = {
    digest,
    evidenceCount: evidence.length,
    fixtureName: fixture.name,
    snapshot,
    sourceType: fixture.sourceType,
  };

  if (options.verifyExpected !== false) {
    if (policy.policyStatus !== fixture.expected.policyStatus) {
      throw new ConnectorFixtureError(
        `${fixture.name}: policy status ${policy.policyStatus} does not match ${fixture.expected.policyStatus}`,
      );
    }
    if (evidence.length !== fixture.expected.evidenceCount) {
      throw new ConnectorFixtureError(
        `${fixture.name}: evidence count ${evidence.length} does not match ${fixture.expected.evidenceCount}`,
      );
    }
    if (digest !== fixture.expected.replayDigest) {
      throw new ConnectorFixtureError(
        `${fixture.name}: replay digest ${digest} does not match ${fixture.expected.replayDigest}`,
      );
    }
  }

  return result;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function createReplayConnector(
  fixture: ConnectorFixture,
  now: () => Date,
  calls: { fetch: number },
): SourceConnector {
  const resolver: DnsResolver = async (hostname) => {
    const match = Object.entries(fixture.recording.dns ?? {}).find(
      ([recordedHost]) => normalizeHost(recordedHost) === normalizeHost(hostname),
    );
    if (!match) {
      throw new ConnectorFixtureError(`${fixture.name}: unrecorded DNS lookup for ${hostname}`);
    }
    return structuredClone(match[1]);
  };
  const fetchImpl: FetchLike = async (url) => {
    calls.fetch += 1;
    const recording = fixture.recording.http;
    if (!recording || url !== recording.requestUrl) {
      throw new ConnectorFixtureError(`${fixture.name}: unrecorded HTTP request for ${url}`);
    }
    const headers = Object.entries(recording.response.headers);
    const response: HttpResponseLike = {
      headers: {
        get(name: string): string | null {
          return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? null;
        },
      },
      ok: recording.response.status >= 200 && recording.response.status < 300,
      status: recording.response.status,
      async text(): Promise<string> {
        return recording.response.body;
      },
    };
    return response;
  };
  const networkOptions: Partial<Omit<SafeFetchOptions, "sourceType" | "timeoutMs">> = {
    fetchImpl,
    now,
    resolver,
  };

  switch (fixture.sourceType) {
    case "company_website":
    case "user_url":
      return new GenericPublicUrlConnector(fixture.sourceType, networkOptions);
    case "github":
      return new GitHubConnector(networkOptions);
    case "orcid":
      return new OrcidConnector(networkOptions);
    case "semantic_scholar":
      return new SemanticScholarConnector(networkOptions);
    case "crossref":
      return new CrossrefConnector(networkOptions);
    case "csv_import":
      return new CsvImportConnector(now);
    case "manual_linkedin_context":
      return new ManualLinkedInContextConnector(now);
    default:
      return unsupportedSourceType(fixture.sourceType);
  }
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

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function unsupportedSourceType(sourceType: SourceType): never {
  throw new ConnectorFixtureError(`No replay connector is available for ${String(sourceType)}`);
}
