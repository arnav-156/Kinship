import { describe, expect, it, vi } from "vitest";

import { GenericPublicUrlConnector } from "./generic-url.connector";
import type { DnsResolver, FetchLike } from "./types";

const resolver: DnsResolver = async () => [{ address: "93.184.216.34", family: 4 }];

describe("GenericPublicUrlConnector", () => {
  it("fetches, hashes, normalizes, and extracts evidence from public URL content", async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({
      headers: {
        get: () => "text/html",
      },
      ok: true,
      status: 200,
      text: async () =>
        "<html><body><h1>Example Labs</h1><p>Builds research tools.</p></body></html>",
    }));
    const connector = new GenericPublicUrlConnector("company_website", {
      fetchImpl,
      resolver,
    });

    const result = await connector.fetch({
      sourceIdentifier: "https://example.com",
      tenantId: "tenant_1",
      timeoutMs: 1000,
      workspaceId: "workspace_1",
    });
    const document = await connector.normalize(result);
    const evidence = await connector.extractEvidence(document);

    expect(result.contentHash).toMatch(/^sha256:/);
    expect(document.text).toContain("Example Labs");
    expect(evidence[0]?.evidenceSummary).toContain("Builds research tools");
  });
});
