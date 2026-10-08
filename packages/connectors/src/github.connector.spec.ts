import { describe, expect, it, vi } from "vitest";

import { GitHubConnector } from "./github.connector";
import type { DnsResolver, FetchLike } from "./types";

const resolver: DnsResolver = async () => [{ address: "140.82.112.6", family: 4 }];

describe("GitHubConnector", () => {
  it("uses the GitHub public API for repository URLs", async () => {
    const fetchImpl = vi.fn(async () => ({
      headers: {
        get: () => "application/json",
      },
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          description: "A useful repository",
          full_name: "openai/example",
          html_url: "https://github.com/openai/example",
          language: "TypeScript",
          stargazers_count: 42,
        }),
    })) satisfies FetchLike;
    const connector = new GitHubConnector({
      fetchImpl,
      resolver,
    });

    const result = await connector.fetch({
      sourceIdentifier: "https://github.com/openai/example",
      tenantId: "tenant_1",
      timeoutMs: 1000,
      workspaceId: "workspace_1",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/openai/example",
      expect.any(Object),
    );
    expect((await connector.normalize(result)).text).toContain("A useful repository");
  });
});
