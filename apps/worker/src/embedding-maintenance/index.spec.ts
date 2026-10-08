import { describe, expect, it, vi } from "vitest";

import {
  EmbeddingMaintenanceRunner,
  type EmbeddingCheckpoint,
  type EmbeddingCheckpointStore,
  type EmbeddingGateway,
  type EmbeddingMaintenanceConfig,
  type EvidenceEmbeddingRecord,
  type EvidenceEmbeddingStore,
} from "./index";

describe("EmbeddingMaintenanceRunner", () => {
  it("backfills only missing embeddings and checkpoints every successful row", async () => {
    const store = new MemoryEvidenceStore([
      row("evidence_1", false),
      row("evidence_2", true),
      row("evidence_3", false),
    ]);
    const checkpoints = new MemoryCheckpointStore();
    const result = await runner(store, gateway(), checkpoints).run(config("backfill"));

    expect(result).toMatchObject({
      candidateCountAtStart: 2,
      dryRun: false,
      indexRebuilt: false,
      processedThisRun: 2,
    });
    expect(store.writes).toEqual(["evidence_1", "evidence_3"]);
    expect(checkpoints.checkpoint).toMatchObject({
      afterEvidenceId: "evidence_3",
      status: "complete",
      totalProcessed: 2,
    });
    expect(checkpoints.saves).toBeGreaterThanOrEqual(4);
  });

  it("resumes after the last successful checkpoint without duplicating work", async () => {
    const store = new MemoryEvidenceStore([
      row("evidence_1", false),
      row("evidence_2", false),
      row("evidence_3", false),
    ]);
    const checkpoints = new MemoryCheckpointStore();
    let calls = 0;
    const failingGateway: EmbeddingGateway = {
      async embedText() {
        calls += 1;
        if (calls === 2) {
          throw new Error("provider unavailable");
        }
        return embedding();
      },
    };
    await expect(
      runner(store, failingGateway, checkpoints).run(config("backfill")),
    ).rejects.toThrow("provider unavailable");
    expect(store.writes).toEqual(["evidence_1"]);
    expect(checkpoints.checkpoint).toMatchObject({
      afterEvidenceId: "evidence_1",
      status: "failed",
      totalProcessed: 1,
    });

    const resumed = await runner(store, gateway(), checkpoints).run(config("backfill"), {
      resume: true,
    });
    expect(resumed.processedThisRun).toBe(2);
    expect(store.writes).toEqual(["evidence_1", "evidence_2", "evidence_3"]);
    expect(checkpoints.checkpoint).toMatchObject({ status: "complete", totalProcessed: 3 });
  });

  it("reindexes every selected row and rebuilds the vector index only on completion", async () => {
    const store = new MemoryEvidenceStore([row("evidence_1", true), row("evidence_2", false)]);
    const checkpoints = new MemoryCheckpointStore();
    const first = await runner(store, gateway(), checkpoints).run(config("reindex"), {
      maxItems: 1,
    });
    expect(first.checkpoint?.status).toBe("paused");
    expect(store.rebuiltIndexes).toBe(0);

    const resumed = await runner(store, gateway(), checkpoints).run(config("reindex"), {
      resume: true,
    });
    expect(resumed).toMatchObject({ indexRebuilt: true, processedThisRun: 1 });
    expect(store.writes).toEqual(["evidence_1", "evidence_2"]);
    expect(store.rebuiltIndexes).toBe(1);
  });

  it("keeps dry-run free of provider, database-write, index, and checkpoint effects", async () => {
    const store = new MemoryEvidenceStore([row("evidence_1", false)]);
    const checkpoints = new MemoryCheckpointStore();
    const embedText = vi.fn();
    const result = await runner(store, { embedText }, checkpoints).run(config("backfill"), {
      dryRun: true,
    });

    expect(result).toEqual({
      candidateCountAtStart: 1,
      dryRun: true,
      indexRebuilt: false,
      processedThisRun: 0,
    });
    expect(embedText).not.toHaveBeenCalled();
    expect(store.writes).toEqual([]);
    expect(store.rebuiltIndexes).toBe(0);
    expect(checkpoints.saves).toBe(0);
  });

  it("fails closed on invalid vector dimensions and incompatible resume options", async () => {
    const store = new MemoryEvidenceStore([row("evidence_1", false)]);
    const checkpoints = new MemoryCheckpointStore();
    await expect(
      runner(
        store,
        {
          async embedText() {
            return { ...embedding(), dimensions: 2 };
          },
        },
        checkpoints,
      ).run(config("backfill")),
    ).rejects.toThrow(/dimensions must be 3/);
    expect(store.writes).toEqual([]);
    expect(checkpoints.checkpoint?.status).toBe("failed");

    await expect(
      runner(store, gateway(), checkpoints).run(
        { ...config("backfill"), model: "other-model" },
        {
          resume: true,
        },
      ),
    ).rejects.toThrow(/configuration does not match/);
  });
});

interface MemoryRow extends EvidenceEmbeddingRecord {
  embedded: boolean;
}

class MemoryEvidenceStore implements EvidenceEmbeddingStore {
  rebuiltIndexes = 0;
  writes: string[] = [];

  constructor(private readonly rows: MemoryRow[]) {}

  async countCandidates(config: EmbeddingMaintenanceConfig): Promise<number> {
    return this.selected(config).length;
  }

  async fetchBatch(
    config: EmbeddingMaintenanceConfig,
    afterEvidenceId: string | undefined,
    limit: number,
  ): Promise<EvidenceEmbeddingRecord[]> {
    return this.selected(config)
      .filter((item) => !afterEvidenceId || item.evidenceId > afterEvidenceId)
      .slice(0, limit);
  }

  async writeEmbedding(record: EvidenceEmbeddingRecord): Promise<void> {
    const item = this.rows.find((candidate) => candidate.evidenceId === record.evidenceId);
    if (!item) throw new Error("row missing");
    item.embedded = true;
    this.writes.push(record.evidenceId);
  }

  async rebuildVectorIndex(): Promise<void> {
    this.rebuiltIndexes += 1;
  }

  private selected(config: EmbeddingMaintenanceConfig): MemoryRow[] {
    return this.rows
      .filter((item) => config.mode === "reindex" || !item.embedded)
      .filter((item) => !config.tenantId || item.tenantId === config.tenantId)
      .filter((item) => !config.workspaceId || item.workspaceId === config.workspaceId)
      .sort((left, right) => left.evidenceId.localeCompare(right.evidenceId));
  }
}

class MemoryCheckpointStore implements EmbeddingCheckpointStore {
  checkpoint?: EmbeddingCheckpoint;
  saves = 0;

  async load(): Promise<EmbeddingCheckpoint | undefined> {
    return this.checkpoint ? structuredClone(this.checkpoint) : undefined;
  }

  async save(checkpoint: EmbeddingCheckpoint): Promise<void> {
    this.checkpoint = structuredClone(checkpoint);
    this.saves += 1;
  }
}

function runner(
  store: EvidenceEmbeddingStore,
  embeddingGateway: EmbeddingGateway,
  checkpointStore: EmbeddingCheckpointStore,
) {
  return new EmbeddingMaintenanceRunner(
    store,
    embeddingGateway,
    checkpointStore,
    () => new Date("2026-07-01T12:00:00.000Z"),
  );
}

function config(mode: "backfill" | "reindex"): EmbeddingMaintenanceConfig {
  return {
    batchSize: 2,
    expectedDimensions: 3,
    mode,
    model: "fixture-embedding",
    tenantId: "fixture-tenant",
    workspaceId: "fixture-workspace",
  };
}

function gateway(): EmbeddingGateway {
  return {
    async embedText() {
      return embedding();
    },
  };
}

function embedding() {
  return {
    dimensions: 3,
    embedding: [0.1, 0.2, 0.3],
    model: "fixture-embedding",
    provider: "fixture",
  };
}

function row(evidenceId: string, embedded: boolean): MemoryRow {
  return {
    embedded,
    evidenceId,
    evidenceSummary: `Summary ${evidenceId}`,
    tenantId: "fixture-tenant",
    workspaceId: "fixture-workspace",
  };
}
