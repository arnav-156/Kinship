import { pathToFileURL } from "node:url";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type SmokeCheck = {
  detail: string;
  name: "auth-protection" | "health" | "metrics" | "ready";
  ok: boolean;
  status?: number;
};

export type SmokeResult = {
  checks: SmokeCheck[];
  ok: boolean;
};

export type ApiSmokeOptions = {
  apiBaseUrl: string;
  fetchImpl?: FetchLike;
  requireReadyOk?: boolean;
};

export async function runApiSmoke(options: ApiSmokeOptions): Promise<SmokeResult> {
  const baseUrl = normalizeBaseUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks: SmokeCheck[] = [];

  checks.push(await checkHealth(fetchImpl, baseUrl));
  checks.push(await checkReady(fetchImpl, baseUrl, Boolean(options.requireReadyOk)));
  checks.push(await checkMetrics(fetchImpl, baseUrl));
  checks.push(await checkAuthProtection(fetchImpl, baseUrl));

  return {
    checks,
    ok: checks.every((check) => check.ok),
  };
}

async function checkHealth(fetchImpl: FetchLike, baseUrl: string): Promise<SmokeCheck> {
  try {
    const response = await fetchImpl(`${baseUrl}/health`);
    const body = await readJsonRecord(response);
    const ok = response.status === 200 && body?.["service"] === "api" && body?.["status"] === "ok";

    return {
      detail: ok ? "API liveness is healthy" : "API liveness did not return service=api/status=ok",
      name: "health",
      ok,
      status: response.status,
    };
  } catch (error) {
    return failedCheck("health", error);
  }
}

async function checkReady(
  fetchImpl: FetchLike,
  baseUrl: string,
  requireReadyOk: boolean,
): Promise<SmokeCheck> {
  try {
    const response = await fetchImpl(`${baseUrl}/ready`);
    const body = await readJsonRecord(response);
    const status = String(body?.["status"] ?? "");
    const database = getNestedString(body, "checks", "database");
    const acceptsDegraded = !requireReadyOk && status === "degraded";
    const ok =
      response.status === 200 &&
      ((status === "ok" && database === "ok") || (acceptsDegraded && database === "degraded"));

    return {
      detail: ok
        ? `Readiness returned ${status}`
        : `Readiness returned status=${status || "missing"}, database=${database || "missing"}`,
      name: "ready",
      ok,
      status: response.status,
    };
  } catch (error) {
    return failedCheck("ready", error);
  }
}

async function checkMetrics(fetchImpl: FetchLike, baseUrl: string): Promise<SmokeCheck> {
  try {
    const response = await fetchImpl(`${baseUrl}/metrics`);
    const body = await response.text();
    const ok = response.status === 200 && body.includes("relationship_api_up 1");

    return {
      detail: ok
        ? "Metrics endpoint exposes process health"
        : "Metrics response is missing relationship_api_up",
      name: "metrics",
      ok,
      status: response.status,
    };
  } catch (error) {
    return failedCheck("metrics", error);
  }
}

async function checkAuthProtection(fetchImpl: FetchLike, baseUrl: string): Promise<SmokeCheck> {
  try {
    const response = await fetchImpl(`${baseUrl}/v1/auth/me`);
    const ok = response.status === 401;

    return {
      detail: ok
        ? "Protected auth route rejects anonymous access"
        : "Protected auth route did not return 401",
      name: "auth-protection",
      ok,
      status: response.status,
    };
  } catch (error) {
    return failedCheck("auth-protection", error);
  }
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value = (await response.json()) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function getNestedString(
  value: Record<string, unknown> | undefined,
  parentKey: string,
  childKey: string,
): string | undefined {
  const parent = value?.[parentKey];
  if (typeof parent !== "object" || parent === null || Array.isArray(parent)) {
    return undefined;
  }

  const child = (parent as Record<string, unknown>)[childKey];
  return typeof child === "string" ? child : undefined;
}

function failedCheck(name: SmokeCheck["name"], error: unknown): SmokeCheck {
  return {
    detail: error instanceof Error ? error.message : String(error),
    name,
    ok: false,
  };
}

export function isDirectEntrypoint(metaUrl: string, argvPath: string | undefined): boolean {
  return Boolean(argvPath && metaUrl === pathToFileURL(argvPath).href);
}
async function main(): Promise<void> {
  const apiBaseUrl = process.env["API_SMOKE_BASE_URL"] ?? "http://localhost:7000";
  const requireReadyOk =
    process.env["API_SMOKE_REQUIRE_READY_OK"] === "true" ||
    process.argv.includes("--require-ready-ok");
  const result = await runApiSmoke({ apiBaseUrl, requireReadyOk });

  for (const check of result.checks) {
    const status = check.status ? ` HTTP ${check.status}` : "";
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}${status}: ${check.detail}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (isDirectEntrypoint(import.meta.url, process.argv[1])) {
  void main();
}
