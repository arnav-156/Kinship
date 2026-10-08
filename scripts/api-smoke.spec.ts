import { describe, expect, it } from "vitest";

import { isDirectEntrypoint, runApiSmoke } from "./api-smoke";

describe("runApiSmoke", () => {
  it("checks health, readiness, metrics, and protected route auth", async () => {
    const requested: string[] = [];
    const fetchImpl = async (url: string) => {
      requested.push(url);
      if (url.endsWith("/health")) {
        return jsonResponse(200, { service: "api", status: "ok" });
      }
      if (url.endsWith("/ready")) {
        return jsonResponse(200, { checks: { database: "ok" }, service: "api", status: "ok" });
      }
      if (url.endsWith("/metrics")) {
        return textResponse(200, "relationship_api_up 1\n");
      }
      if (url.endsWith("/v1/auth/me")) {
        return jsonResponse(401, { code: "UNAUTHORIZED" });
      }
      return jsonResponse(404, { code: "NOT_FOUND" });
    };

    const result = await runApiSmoke({
      apiBaseUrl: "http://localhost:7000/",
      fetchImpl,
      requireReadyOk: true,
    });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => [check.name, check.ok])).toEqual([
      ["health", true],
      ["ready", true],
      ["metrics", true],
      ["auth-protection", true],
    ]);
    expect(requested).toEqual([
      "http://localhost:7000/health",
      "http://localhost:7000/ready",
      "http://localhost:7000/metrics",
      "http://localhost:7000/v1/auth/me",
    ]);
  });

  it("fails readiness when strict readiness is required and the database is degraded", async () => {
    const fetchImpl = async (url: string) => {
      if (url.endsWith("/health")) {
        return jsonResponse(200, { service: "api", status: "ok" });
      }
      if (url.endsWith("/ready")) {
        return jsonResponse(200, {
          checks: { database: "degraded" },
          service: "api",
          status: "degraded",
        });
      }
      if (url.endsWith("/metrics")) {
        return textResponse(200, "relationship_api_up 1\n");
      }
      return jsonResponse(401, { code: "UNAUTHORIZED" });
    };

    const result = await runApiSmoke({
      apiBaseUrl: "http://localhost:7000",
      fetchImpl,
      requireReadyOk: true,
    });

    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.name === "ready")).toMatchObject({
      ok: false,
      status: 200,
    });
  });
});

describe("isDirectEntrypoint", () => {
  it("matches Windows argv paths to file URLs", () => {
    expect(
      isDirectEntrypoint(
        "file:///C:/Projects/AI-Relationship/scripts/api-smoke.ts",
        "C:\\Projects\\AI-Relationship\\scripts\\api-smoke.ts",
      ),
    ).toBe(true);
  });

  it("rejects a different argv path", () => {
    expect(
      isDirectEntrypoint(
        "file:///C:/Projects/AI-Relationship/scripts/api-smoke.ts",
        "C:\\Projects\\AI-Relationship\\scripts\\other.ts",
      ),
    ).toBe(false);
  });
});
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function textResponse(status: number, body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain" },
    status,
  });
}
