import { describe, expect, it, vi } from "vitest";

import { PrismaEvidenceEmbeddingStore } from "./prisma-store";

const config = {
  batchSize: 25,
  expectedDimensions: 1536,
  mode: "backfill" as const,
  model: "text-embedding-3-small",
  tenantId: "tenant_1",
  workspaceId: "workspace_1",
};

describe("PrismaEvidenceEmbeddingStore", () => {
  it("counts and pages evidence within mode and tenant/workspace scope", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([
        {
          evidenceId: "evidence_2",
          evidenceSummary: "Evidence summary",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
      ]);
    const store = new PrismaEvidenceEmbeddingStore({ $queryRaw: queryRaw } as never);

    await expect(store.countCandidates(config)).resolves.toBe(2);
    await expect(store.fetchBatch(config, "evidence_1", 10)).resolves.toEqual([
      {
        evidenceId: "evidence_2",
        evidenceSummary: "Evidence summary",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
    ]);

    const countQuery = queryRaw.mock.calls[0]?.[0] as { values: unknown[] };
    const pageQuery = queryRaw.mock.calls[1]?.[0] as { values: unknown[] };
    expect(countQuery.values).toEqual(["tenant_1", "workspace_1"]);
    expect(pageQuery.values).toEqual(["tenant_1", "workspace_1", "evidence_1", 10]);
  });

  it("writes scoped vectors and rebuilds only the named pgvector index", async () => {
    const executeRaw = vi.fn().mockResolvedValue(1);
    const executeRawUnsafe = vi.fn().mockResolvedValue(0);
    const store = new PrismaEvidenceEmbeddingStore({
      $executeRaw: executeRaw,
      $executeRawUnsafe: executeRawUnsafe,
    } as never);

    await store.writeEmbedding(
      {
        evidenceId: "evidence_1",
        evidenceSummary: "Evidence summary",
        tenantId: "tenant_1",
        workspaceId: "workspace_1",
      },
      [0.1, -0.2, 0.3],
    );
    const updateQuery = executeRaw.mock.calls[0]?.[0] as { values: unknown[] };
    expect(updateQuery.values).toEqual(["[0.1,-0.2,0.3]", "evidence_1", "tenant_1", "workspace_1"]);

    await store.rebuildVectorIndex();
    expect(executeRawUnsafe).toHaveBeenCalledWith(
      'REINDEX INDEX "evidence_items_embedding_ivfflat_idx"',
    );
  });

  it("fails when a scoped update no longer identifies exactly one evidence row", async () => {
    const store = new PrismaEvidenceEmbeddingStore({
      $executeRaw: vi.fn().mockResolvedValue(0),
    } as never);
    await expect(
      store.writeEmbedding(
        {
          evidenceId: "missing",
          evidenceSummary: "Evidence summary",
          tenantId: "tenant_1",
          workspaceId: "workspace_1",
        },
        [0.1],
      ),
    ).rejects.toThrow(/not updated in its original scope/);
  });
});
