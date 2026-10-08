import fs from "node:fs";
import path from "node:path";

import type { SourceType } from "@relationship/shared";

import { isPublicAddress } from "../safe-url";
import type { ConnectorFixture } from "./types";
import { ConnectorFixtureError } from "./types";

const supportedSourceTypes = new Set<SourceType>([
  "company_website",
  "user_url",
  "github",
  "orcid",
  "semantic_scholar",
  "crossref",
  "csv_import",
  "manual_linkedin_context",
]);

const sensitiveKeyFragments = ["authorization", "cookie", "password", "secret", "token", "apikey"];

export function loadConnectorFixtures(inputs: string[]): ConnectorFixture[] {
  const files = inputs
    .flatMap(resolveFixtureFiles)
    .sort((left, right) => left.localeCompare(right));
  if (files.length === 0) {
    throw new ConnectorFixtureError("No connector fixture JSON files were found");
  }

  return files.map((file) => {
    let value: unknown;
    try {
      value = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new ConnectorFixtureError(
        `Could not parse fixture ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return validateConnectorFixture(value, file);
  });
}

export function validateConnectorFixture(value: unknown, label = "fixture"): ConnectorFixture {
  const fixture = requireRecord(value, label) as unknown as ConnectorFixture;
  if (fixture.schemaVersion !== 1) {
    fail(label, "schemaVersion must be 1");
  }
  requireNonEmptyString(fixture.name, label, "name");
  if (!supportedSourceTypes.has(fixture.sourceType)) {
    fail(label, `sourceType ${String(fixture.sourceType)} has no replay-capable connector`);
  }

  const request = requireRecord(fixture.request, `${label}.request`);
  const scope = requireRecord(fixture.scope, `${label}.scope`);
  const recording = requireRecord(fixture.recording, `${label}.recording`);
  const expected = requireRecord(fixture.expected, `${label}.expected`);
  requireNonEmptyString(request.sourceIdentifier, label, "request.sourceIdentifier");
  requireNonEmptyString(request.tenantId, label, "request.tenantId");
  requireNonEmptyString(request.workspaceId, label, "request.workspaceId");
  if (
    typeof request.timeoutMs !== "number" ||
    !Number.isFinite(request.timeoutMs) ||
    request.timeoutMs <= 0
  ) {
    fail(label, "request.timeoutMs must be a positive number");
  }
  requireNonEmptyString(scope.tenantId, label, "scope.tenantId");
  requireNonEmptyString(scope.workspaceId, label, "scope.workspaceId");
  const allowedHosts = requireStringArray(scope.allowedHosts, label, "scope.allowedHosts").map(
    normalizeHost,
  );
  const allowedContextKeys = requireStringArray(
    scope.allowedContextKeys,
    label,
    "scope.allowedContextKeys",
  );
  if (request.tenantId !== scope.tenantId || request.workspaceId !== scope.workspaceId) {
    fail(label, "request tenantId/workspaceId must exactly match the declared scope");
  }

  const context =
    request.context === undefined ? {} : requireRecord(request.context, `${label}.request.context`);
  for (const key of Object.keys(context)) {
    if (!allowedContextKeys.includes(key)) {
      fail(label, `request context key ${key} is not declared in scope.allowedContextKeys`);
    }
  }

  validateSourceIdentifier(String(request.sourceIdentifier), allowedHosts, label);
  const recordedAt = requireNonEmptyString(recording.recordedAt, label, "recording.recordedAt");
  if (Number.isNaN(Date.parse(recordedAt)) || new Date(recordedAt).toISOString() !== recordedAt) {
    fail(label, "recording.recordedAt must be an ISO-8601 UTC timestamp");
  }

  const dns =
    recording.dns === undefined ? {} : requireRecord(recording.dns, `${label}.recording.dns`);
  for (const [hostname, addressesValue] of Object.entries(dns)) {
    const normalizedHost = normalizeHost(hostname);
    if (!allowedHosts.includes(normalizedHost)) {
      fail(label, `recorded DNS host ${hostname} is outside scope.allowedHosts`);
    }
    if (!Array.isArray(addressesValue) || addressesValue.length === 0) {
      fail(label, `recorded DNS host ${hostname} must have at least one address`);
    }
    for (const addressValue of addressesValue) {
      const address = requireRecord(addressValue, `${label}.recording.dns.${hostname}`);
      if (typeof address.address !== "string" || !isPublicAddress(address.address)) {
        fail(label, `recorded DNS host ${hostname} contains a private or invalid address`);
      }
      if (address.family !== 4 && address.family !== 6) {
        fail(label, `recorded DNS host ${hostname} contains an invalid address family`);
      }
    }
  }

  if (recording.http !== undefined) {
    const http = requireRecord(recording.http, `${label}.recording.http`);
    const requestUrl = requireNonEmptyString(http.requestUrl, label, "recording.http.requestUrl");
    const url = parseHttpUrl(requestUrl, label, "recording.http.requestUrl");
    if (!allowedHosts.includes(normalizeHost(url.hostname))) {
      fail(label, `recorded HTTP host ${url.hostname} is outside scope.allowedHosts`);
    }
    if (
      !Object.keys(dns).some((hostname) => normalizeHost(hostname) === normalizeHost(url.hostname))
    ) {
      fail(label, `recorded HTTP host ${url.hostname} has no deterministic DNS recording`);
    }
    const response = requireRecord(http.response, `${label}.recording.http.response`);
    if (typeof response.status !== "number" || !Number.isInteger(response.status)) {
      fail(label, "recording.http.response.status must be an integer");
    }
    requireRecord(response.headers, `${label}.recording.http.response.headers`);
    if (typeof response.body !== "string") {
      fail(label, "recording.http.response.body must be a string");
    }
  }

  if (!recording.http && !["csv_import", "manual_linkedin_context"].includes(fixture.sourceType)) {
    fail(label, "network connector fixtures require a recorded HTTP exchange");
  }
  if (
    typeof expected.evidenceCount !== "number" ||
    !Number.isInteger(expected.evidenceCount) ||
    expected.evidenceCount < 0
  ) {
    fail(label, "expected.evidenceCount must be a non-negative integer");
  }
  if (!["allowed", "warn", "blocked"].includes(String(expected.policyStatus))) {
    fail(label, "expected.policyStatus is invalid");
  }
  requireNonEmptyString(expected.replayDigest, label, "expected.replayDigest");
  rejectSensitiveKeys(fixture, label);

  fixture.scope.allowedHosts = allowedHosts;
  return fixture;
}

function resolveFixtureFiles(input: string): string[] {
  const resolved = path.resolve(input);
  if (!fs.existsSync(resolved)) {
    throw new ConnectorFixtureError(`Fixture path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return path.extname(resolved).toLowerCase() === ".json" ? [resolved] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  return fs
    .readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
    .map((entry) => path.join(resolved, entry.name));
}

function validateSourceIdentifier(
  sourceIdentifier: string,
  allowedHosts: string[],
  label: string,
): void {
  let url: URL;
  try {
    url = new URL(sourceIdentifier);
  } catch {
    return;
  }
  if (
    ["http:", "https:"].includes(url.protocol) &&
    !allowedHosts.includes(normalizeHost(url.hostname))
  ) {
    fail(label, `source identifier host ${url.hostname} is outside scope.allowedHosts`);
  }
}

function parseHttpUrl(value: string, label: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    fail(label, `${field} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    fail(label, `${field} must be an HTTP(S) URL without credentials`);
  }
  return url;
}

function rejectSensitiveKeys(value: unknown, label: string, trail = label): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveKeys(item, label, `${trail}[${index}]`));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (sensitiveKeyFragments.some((fragment) => normalized.includes(fragment))) {
      fail(label, `sensitive field ${trail}.${key} is forbidden in recorded fixtures`);
    }
    rejectSensitiveKeys(child, label, `${trail}.${key}`);
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ConnectorFixtureError(`${field} must be an object`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    fail(label, `${field} must be an array of non-empty strings`);
  }
  return [...new Set(value as string[])];
}

function requireNonEmptyString(value: unknown, label: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    fail(label, `${field} must be a non-empty string`);
  }
  return value;
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(label: string, message: string): never {
  throw new ConnectorFixtureError(`${label}: ${message}`);
}
