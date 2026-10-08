import type { SloSample, SloTarget } from "./index";

export interface LiveSloContext {
  apiBaseUrl: string;
  briefId: string;
  entityId: string;
  token: string;
  url: string;
  workspaceId: string;
}

export interface SloHttpRequest {
  init: RequestInit;
  url: string;
}

interface HttpExecutorOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function buildSloRequest(target: SloTarget, context: LiveSloContext): SloHttpRequest {
  const baseUrl = context.apiBaseUrl.replace(/\/+$/, "");
  const headers = {
    Authorization: `Bearer ${context.token}`,
    "Content-Type": "application/json",
  };

  switch (target.name) {
    case "workspace":
      return {
        init: { headers, method: "GET" },
        url: `${baseUrl}/v1/workspaces/${context.workspaceId}`,
      };
    case "search":
      return post(`${baseUrl}/v1/search/evidence`, headers, {
        limit: 10,
        query: "synthetic relationship research",
        workspaceId: context.workspaceId,
      });
    case "urlAnalysis":
      return post(`${baseUrl}/v1/analyze-url`, headers, {
        goal: "Controlled SLO load test",
        sourceType: "user_url",
        subjectName: "SLO Synthetic Subject",
        url: context.url,
        workspaceId: context.workspaceId,
      });
    case "brief":
      return post(`${baseUrl}/v1/relationship-briefs`, headers, {
        goal: "Controlled SLO load test",
        subjectEntityId: context.entityId,
        workspaceId: context.workspaceId,
      });
    case "draft":
      return post(`${baseUrl}/v1/relationship-briefs/${context.briefId}/drafts`, headers, {
        variant: "concise",
      });
  }
}

export function createHttpExecutor(
  context: LiveSloContext,
  options: HttpExecutorOptions = {},
): (target: SloTarget) => Promise<SloSample> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => performance.now());

  return async (target) => {
    const request = buildSloRequest(target, context);
    const startedAt = now();
    const response = await fetchImpl(request.url, request.init);
    await response.arrayBuffer();
    return {
      durationMs: now() - startedAt,
      status: response.status,
    };
  };
}

function post(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
): SloHttpRequest {
  return {
    init: {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    },
    url,
  };
}
