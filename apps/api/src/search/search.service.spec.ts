import { ForbiddenException } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { describe, expect, it, vi } from "vitest";

import { SearchService } from "./search.service";

const principal: AuthenticatedPrincipal = {
  email: "member@example.local",
  tenantId: "tenant_1",
  userId: "user_1",
  workspaceRoles: [
    {
      role: "member",
      workspaceId: "workspace_1",
    },
  ],
};

describe("SearchService", () => {
  it("blocks evidence search outside the authenticated workspace memberships", async () => {
    const service = new SearchService({} as never);

    await expect(
      service.searchEvidence(principal, {
        query: "founder",
        workspaceId: "workspace_2",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("scopes evidence search by tenant and workspace", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new SearchService({ $queryRaw: queryRaw } as never);

    await service.searchEvidence(principal, {
      query: "founder",
      sourceTypes: ["github"],
      workspaceId: "workspace_1",
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('e."tenant_id" =');
    expect(query.sql).toContain('e."workspace_id" =');
    expect(query.sql).toContain('e."source_type" IN');
    expect(query.values).toContain("tenant_1");
    expect(query.values).toContain("workspace_1");
    expect(query.values).toContain("github");
  });

  it("uses pgvector retrieval when a production-sized query embedding is available", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const embedText = vi.fn().mockResolvedValue({
      dimensions: 1536,
      embedding: Array.from({ length: 1536 }, () => 0.01),
      model: "fixture-embedding",
      provider: "openai-compatible",
    });
    const service = new SearchService({ $queryRaw: queryRaw } as never, { embedText } as never);

    const result = await service.searchEvidence(principal, {
      query: "database maintainer",
      workspaceId: "workspace_1",
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql: string };
    expect(embedText).toHaveBeenCalledWith({ input: "database maintainer", timeoutMs: 10_000 });
    expect(query.sql).toContain('e."embedding" <=>');
    expect(result.retrievalMode).toBe("hybrid");
  });

  it("falls back to indexed lexical retrieval when embedding generation fails", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new SearchService(
      { $queryRaw: queryRaw } as never,
      { embedText: vi.fn().mockRejectedValue(new Error("provider unavailable")) } as never,
    );

    const result = await service.searchEvidence(principal, {
      query: "database maintainer",
      workspaceId: "workspace_1",
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql: string };
    expect(query.sql).toContain('e."search_vector" @@');
    expect(query.sql).not.toContain('e."embedding" <=>');
    expect(result.retrievalMode).toBe("lexical");
  });

  it("returns explainable deterministic signals for similar people", async () => {
    const service = new SearchService({
      entity: {
        findMany: vi.fn().mockResolvedValue([
          {
            aliases: [],
            canonicalName: "Ada Lovelace",
            id: "entity_2",
            person: {
              fullName: "Ada Lovelace",
              githubLogin: "ada-l",
              linkedinUrl: null,
              location: "London",
              orcidId: "0000-0001-2345-6789",
              primaryEmailHash: null,
            },
            type: "person",
          },
        ]),
      },
    } as never);

    const results = await service.searchSimilarPeople(principal, {
      fullName: "Ada Lovelace",
      githubLogin: "ada-l",
      orcidId: "0000-0001-2345-6789",
      workspaceId: "workspace_1",
    });

    expect(results[0]?.decision).toBe("match");
    expect(results[0]?.signals.map((signal) => signal.type)).toContain("exact_orcid");
  });
});
