import { describe, expect, it, vi } from "vitest";

import { buildSloRequest, createHttpExecutor, type LiveSloContext } from "./http";
import { DEFAULT_SLO_TARGETS } from "./index";

const context: LiveSloContext = {
  apiBaseUrl: "http://localhost:7000/",
  briefId: "brief-1",
  entityId: "entity-1",
  token: "secret-token",
  url: "https://example.com/profile",
  workspaceId: "workspace-1",
};

describe("buildSloRequest", () => {
  it.each([
    ["workspace", "http://localhost:7000/v1/workspaces/workspace-1", "GET", undefined],
    [
      "search",
      "http://localhost:7000/v1/search/evidence",
      "POST",
      {
        limit: 10,
        query: "synthetic relationship research",
        workspaceId: "workspace-1",
      },
    ],
    [
      "urlAnalysis",
      "http://localhost:7000/v1/analyze-url",
      "POST",
      {
        goal: "Controlled SLO load test",
        sourceType: "user_url",
        subjectName: "SLO Synthetic Subject",
        url: "https://example.com/profile",
        workspaceId: "workspace-1",
      },
    ],
    [
      "brief",
      "http://localhost:7000/v1/relationship-briefs",
      "POST",
      {
        goal: "Controlled SLO load test",
        subjectEntityId: "entity-1",
        workspaceId: "workspace-1",
      },
    ],
    [
      "draft",
      "http://localhost:7000/v1/relationship-briefs/brief-1/drafts",
      "POST",
      { variant: "concise" },
    ],
  ] as const)(
    "maps the %s target to its API contract",
    (name, expectedUrl, expectedMethod, expectedBody) => {
      const target = DEFAULT_SLO_TARGETS.find((candidate) => candidate.name === name);
      if (!target) throw new Error(`missing target ${name}`);

      const request = buildSloRequest(target, context);

      expect(request.url).toBe(expectedUrl);
      expect(request.init.method).toBe(expectedMethod);
      expect(request.init.headers).toEqual({
        Authorization: "Bearer secret-token",
        "Content-Type": "application/json",
      });
      expect(request.init.body ? JSON.parse(String(request.init.body)) : undefined).toEqual(
        expectedBody,
      );
    },
  );
});

describe("createHttpExecutor", () => {
  it("records status and elapsed time from the HTTP boundary", async () => {
    const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(0));
    const fetchImpl = vi.fn().mockResolvedValue({ arrayBuffer, status: 202 });
    const now = vi.fn<() => number>().mockReturnValueOnce(100).mockReturnValueOnce(145);
    const execute = createHttpExecutor(context, { fetchImpl, now });

    await expect(execute(DEFAULT_SLO_TARGETS[1]!)).resolves.toEqual({
      durationMs: 45,
      status: 202,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:7000/v1/search/evidence",
      expect.objectContaining({
        body: JSON.stringify({
          limit: 10,
          query: "synthetic relationship research",
          workspaceId: "workspace-1",
        }),
        method: "POST",
      }),
    );
    expect(arrayBuffer).toHaveBeenCalledOnce();
  });

  it("does not include the bearer token in returned samples", async () => {
    const execute = createHttpExecutor(context, {
      fetchImpl: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        status: 200,
      }),
      now: vi.fn().mockReturnValue(10),
    });

    const sample = await execute(DEFAULT_SLO_TARGETS[0]!);

    expect(JSON.stringify(sample)).not.toContain(context.token);
  });
});
