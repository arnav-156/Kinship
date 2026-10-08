import net from "node:net";

import { detectPromptInjection } from "@relationship/ai";
import {
  assertSafePublicUrl,
  ConnectorFixtureError,
  ConnectorPolicyError,
  type DnsResolver,
  validateConnectorFixture,
} from "@relationship/connectors";
import { canPerformWorkspaceAction } from "@relationship/policy";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const securityCategories = [
  "authz",
  "prompt_injection",
  "ssrf",
  "tenant_isolation",
  "xss",
] as const;

type SecurityCategory = (typeof securityCategories)[number];

export interface SecurityRegressionResult {
  actual: string;
  category: SecurityCategory;
  expected: string;
  id: string;
  passed: boolean;
}

export interface SecurityRegressionReport {
  categoryCounts: Record<SecurityCategory, number>;
  failed: number;
  passed: number;
  results: SecurityRegressionResult[];
  total: number;
}

export async function runSecurityRegressionCorpus(
  input: unknown,
): Promise<SecurityRegressionReport> {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Security corpus must be a non-empty array");
  }

  const cases = input.map((value, index) => parseCase(value, index));
  const ids = new Set<string>();
  for (const testCase of cases) {
    if (ids.has(testCase.id)) {
      throw new Error(`Security corpus contains duplicate case ID: ${testCase.id}`);
    }
    ids.add(testCase.id);
  }

  for (const category of securityCategories) {
    if (!cases.some((testCase) => testCase.category === category)) {
      throw new Error(`Security corpus is missing category: ${category}`);
    }
  }

  const results: SecurityRegressionResult[] = [];
  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }

  const categoryCounts = Object.fromEntries(
    securityCategories.map((category) => [
      category,
      results.filter((result) => result.category === category).length,
    ]),
  ) as Record<SecurityCategory, number>;
  const passed = results.filter((result) => result.passed).length;

  return {
    categoryCounts,
    failed: results.length - passed,
    passed,
    results,
    total: results.length,
  };
}

interface ParsedCase {
  category: SecurityCategory;
  id: string;
  value: Record<string, unknown>;
}

function parseCase(value: unknown, index: number): ParsedCase {
  const record = requireRecord(value, `case ${index}`);
  const id = requireString(record, "id");
  const category = requireString(record, "category");
  if (!securityCategories.includes(category as SecurityCategory)) {
    throw new Error(`Security corpus case ${id} has unknown category: ${category}`);
  }
  return {
    category: category as SecurityCategory,
    id,
    value: record,
  };
}

async function runCase(testCase: ParsedCase): Promise<SecurityRegressionResult> {
  switch (testCase.category) {
    case "ssrf":
      return runSsrfCase(testCase);
    case "prompt_injection":
      return runPromptInjectionCase(testCase);
    case "xss":
      return runXssCase(testCase);
    case "authz":
      return runAuthzCase(testCase);
    case "tenant_isolation":
      return runTenantIsolationCase(testCase);
  }
}

async function runSsrfCase(testCase: ParsedCase): Promise<SecurityRegressionResult> {
  const expected = requireString(testCase.value, "expected");
  if (expected !== "allow" && expected !== "reject") {
    throw new Error(`Security corpus case ${testCase.id} has invalid SSRF expectation`);
  }
  const addresses = requireStringArray(testCase.value, "resolvedAddresses");
  const resolver: DnsResolver = async () =>
    addresses.map((address) => ({
      address,
      family: net.isIP(address) as 4 | 6,
    }));

  let actual = "allow";
  try {
    await assertSafePublicUrl(requireString(testCase.value, "url"), resolver);
  } catch (error) {
    actual =
      error instanceof ConnectorPolicyError
        ? "reject"
        : `unexpected-error:${error instanceof Error ? error.message : String(error)}`;
  }

  return result(testCase, expected, actual);
}

function runPromptInjectionCase(testCase: ParsedCase): SecurityRegressionResult {
  const expected = String(requireBoolean(testCase.value, "expectedDetected"));
  const actual = String(
    detectPromptInjection([
      {
        confidenceScore: 1,
        evidenceId: testCase.id,
        rankScore: 1,
        summary: requireString(testCase.value, "summary"),
      },
    ]).includes(testCase.id),
  );
  return result(testCase, expected, actual);
}

function runXssCase(testCase: ParsedCase): SecurityRegressionResult {
  const payload = requireString(testCase.value, "payload");
  const forbiddenRaw = requireString(testCase.value, "forbiddenRaw");
  const requiredEscaped = requireString(testCase.value, "requiredEscaped");
  const markup = renderToStaticMarkup(createElement("span", null, payload));
  const safe = !markup.includes(forbiddenRaw) && markup.includes(requiredEscaped);
  return result(testCase, "escaped", safe ? "escaped" : markup);
}

function runAuthzCase(testCase: ParsedCase): SecurityRegressionResult {
  type Role = Parameters<typeof canPerformWorkspaceAction>[0];
  type Action = Parameters<typeof canPerformWorkspaceAction>[1];
  const expected = String(requireBoolean(testCase.value, "expectedAllowed"));
  const actual = String(
    canPerformWorkspaceAction(
      requireString(testCase.value, "role") as Role,
      requireString(testCase.value, "action") as Action,
    ),
  );
  return result(testCase, expected, actual);
}

function runTenantIsolationCase(testCase: ParsedCase): SecurityRegressionResult {
  const expected = String(requireBoolean(testCase.value, "expectedValid"));
  let actual = "true";
  try {
    validateConnectorFixture(
      {
        expected: {
          evidenceCount: 1,
          policyStatus: "allowed",
          replayDigest: "sha256:security-regression",
        },
        name: testCase.id,
        recording: {
          dns: {},
          recordedAt: "2026-01-01T00:00:00.000Z",
        },
        request: {
          context: { csvText: "name,company\nAda,Example\n" },
          sourceIdentifier: "fixture://security.csv",
          tenantId: requireString(testCase.value, "requestTenantId"),
          timeoutMs: 1_000,
          workspaceId: requireString(testCase.value, "requestWorkspaceId"),
        },
        schemaVersion: 1,
        scope: {
          allowedContextKeys: ["csvText"],
          allowedHosts: [],
          tenantId: requireString(testCase.value, "scopeTenantId"),
          workspaceId: requireString(testCase.value, "scopeWorkspaceId"),
        },
        sourceType: "csv_import",
      },
      testCase.id,
    );
  } catch (error) {
    actual =
      error instanceof ConnectorFixtureError
        ? "false"
        : `unexpected-error:${error instanceof Error ? error.message : String(error)}`;
  }
  return result(testCase, expected, actual);
}

function result(testCase: ParsedCase, expected: string, actual: string): SecurityRegressionResult {
  return {
    actual,
    category: testCase.category,
    expected,
    id: testCase.id,
    passed: actual === expected,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Security corpus ${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Security corpus field ${field} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`Security corpus field ${field} must be a boolean`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw new Error(`Security corpus field ${field} must be a non-empty string array`);
  }
  return value as string[];
}
