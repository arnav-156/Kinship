import { describe, expect, it, vi } from "vitest";

import {
  EVIDENCE_EMBEDDING_DIMENSIONS,
  searchHybridEvidence,
  validateEvidenceEmbedding,
  writeEvidenceEmbedding,
} from "./vector-search";

const embedding = () =>
  Array.from({ length: EVIDENCE_EMBEDDING_DIMENSIONS }, (_, index) => index / 10_000);

describe("vector search database helpers", () => {
  it("rejects malformed vectors before a database call", async () => {
    const executeRaw = vi.fn();

    expect(() => validateEvidenceEmbedding([0.1, 0.2])).toThrow("1536 finite values");
    await expect(
      writeEvidenceEmbedding({ $executeRaw: executeRaw } as never, {
        embedding: [...embedding().slice(0, -1), Number.NaN],
        evidenceId: "evidence_1",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      }),
    ).rejects.toThrow("1536 finite values");
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("writes an embedding only through tenant/workspace scope", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);

    await writeEvidenceEmbedding({ $executeRaw: executeRaw } as never, {
      embedding: embedding(),
      evidenceId: "evidence_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    const query = executeRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain('WHERE "id" =');
    expect(query.sql).toContain('AND "tenant_id" =');
    expect(query.sql).toContain('AND "workspace_id" =');
    expect(query.values).toContain("evidence_1");
    expect(query.values).toContain("tenant_1");
    expect(query.values).toContain("workspace_1");
  });

  it("builds parameterized lexical and vector candidate queries", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);

    await searchHybridEvidence({ $queryRaw: queryRaw } as never, {
      candidateLimit: 40,
      query: "database maintainer",
      queryEmbedding: embedding(),
      sourceTypes: ["github"],
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
    });

    const query = queryRaw.mock.calls[0]?.[0] as { sql: string; values: unknown[] };
    expect(query.sql).toContain("websearch_to_tsquery");
    expect(query.sql).toContain('e."search_vector" @@');
    expect(query.sql).toContain('e."embedding" <=>');
    expect(query.sql).toContain('e."tenant_id" =');
    expect(query.sql).toContain('e."workspace_id" =');
    expect(query.sql).toContain('e."source_type" IN');
    expect(query.values).toContain("database maintainer");
    expect(query.values).toContain("tenant_1");
    expect(query.values).toContain("workspace_1");
    expect(query.values).toContain("github");
  });
});
