#!/usr/bin/env node
import { createModelGateway } from "@relationship/ai";
import { disconnectPrismaClient, getPrismaClient } from "@relationship/db";

import { FileEmbeddingCheckpointStore } from "./file-checkpoint";
import {
  EmbeddingMaintenanceRunner,
  type EmbeddingCheckpoint,
  type EmbeddingCheckpointStore,
  type EmbeddingMaintenanceConfig,
  type EvidenceEmbeddingRecord,
  type EvidenceEmbeddingStore,
} from "./index";
import { PrismaEvidenceEmbeddingStore } from "./prisma-store";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args.shift() ?? "backfill";
  if (command === "scenario") {
    await runScenario();
    return;
  }
  if (command !== "backfill" && command !== "reindex") {
    throw new Error("Unknown command. Use backfill, reindex, or scenario.");
  }

  const dryRun = args.includes("--dry-run");
  const provider = option(args, "--provider") ?? process.env["AI_PROVIDER"] ?? "mock";
  if (provider !== "mock" && provider !== "openai-compatible") {
    throw new Error("--provider must be mock or openai-compatible");
  }
  if (!dryRun && provider === "mock") {
    throw new Error(
      "Write mode requires an embedding provider compatible with vector(1536); use --provider openai-compatible or run --dry-run/scenario",
    );
  }
  const checkpointPath = option(args, "--checkpoint");
  if (!dryRun && !checkpointPath) {
    throw new Error("--checkpoint is required for write mode");
  }
  const workspaceId = option(args, "--workspace");
  const tenantId = option(args, "--tenant");
  const config: EmbeddingMaintenanceConfig = {
    batchSize: integerOption(args, "--batch-size", 25),
    expectedDimensions: integerOption(args, "--expected-dimensions", 1536),
    mode: command,
    model:
      option(args, "--model") ?? process.env["OPENAI_EMBEDDING_MODEL"] ?? "text-embedding-3-small",
    tenantId,
    timeoutMs: integerOption(args, "--timeout-ms", 30_000),
    workspaceId,
  };
  const prisma = getPrismaClient();
  const gateway = createModelGateway({
    apiKey: process.env["OPENAI_API_KEY"],
    baseUrl: process.env["OPENAI_BASE_URL"],
    embeddingModel: config.model,
    provider,
  });
  const runner = new EmbeddingMaintenanceRunner(
    new PrismaEvidenceEmbeddingStore(prisma),
    gateway,
    new FileEmbeddingCheckpointStore(checkpointPath ?? "unused-dry-run-checkpoint.json"),
  );
  try {
    const result = await runner.run(config, {
      dryRun,
      maxItems: optionalIntegerOption(args, "--max-items"),
      resume: args.includes("--resume"),
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await disconnectPrismaClient();
  }
}

async function runScenario(): Promise<void> {
  const records: EvidenceEmbeddingRecord[] = ["evidence_1", "evidence_2", "evidence_3"].map(
    (evidenceId) => ({
      evidenceId,
      evidenceSummary: `Summary for ${evidenceId}`,
      tenantId: "fixture-tenant",
      workspaceId: "fixture-workspace",
    }),
  );
  const store = new ScenarioEvidenceStore(records);
  const checkpoints = new ScenarioCheckpointStore();
  const runner = new EmbeddingMaintenanceRunner(
    store,
    {
      async embedText(request) {
        return {
          dimensions: 3,
          embedding: [request.input.length / 100, 0.25, -0.25],
          model: "scenario-embedding",
          provider: "scenario",
        };
      },
    },
    checkpoints,
    () => new Date("2026-07-01T12:00:00.000Z"),
  );
  const config: EmbeddingMaintenanceConfig = {
    batchSize: 2,
    expectedDimensions: 3,
    mode: "reindex",
    model: "scenario-embedding",
    tenantId: "fixture-tenant",
    workspaceId: "fixture-workspace",
  };
  const paused = await runner.run(config, { maxItems: 2 });
  const completed = await runner.run(config, { resume: true });
  console.log(
    JSON.stringify(
      {
        completed,
        paused,
        rebuiltIndexes: store.rebuiltIndexes,
        writtenEvidenceIds: [...store.embeddings.keys()],
      },
      null,
      2,
    ),
  );
}

class ScenarioEvidenceStore implements EvidenceEmbeddingStore {
  readonly embeddings = new Map<string, number[]>();
  rebuiltIndexes = 0;

  constructor(private readonly records: EvidenceEmbeddingRecord[]) {}

  async countCandidates(): Promise<number> {
    return this.records.length;
  }

  async fetchBatch(
    _config: EmbeddingMaintenanceConfig,
    afterEvidenceId: string | undefined,
    limit: number,
  ): Promise<EvidenceEmbeddingRecord[]> {
    return this.records
      .filter((record) => !afterEvidenceId || record.evidenceId > afterEvidenceId)
      .slice(0, limit);
  }

  async writeEmbedding(record: EvidenceEmbeddingRecord, embedding: number[]): Promise<void> {
    this.embeddings.set(record.evidenceId, embedding);
  }

  async rebuildVectorIndex(): Promise<void> {
    this.rebuiltIndexes += 1;
  }
}

class ScenarioCheckpointStore implements EmbeddingCheckpointStore {
  checkpoint?: EmbeddingCheckpoint;

  async load(): Promise<EmbeddingCheckpoint | undefined> {
    return this.checkpoint ? structuredClone(this.checkpoint) : undefined;
  }

  async save(checkpoint: EmbeddingCheckpoint): Promise<void> {
    this.checkpoint = structuredClone(checkpoint);
  }
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith("--"))) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function integerOption(args: string[], name: string, fallback: number): number {
  return optionalIntegerOption(args, name) ?? fallback;
}

function optionalIntegerOption(args: string[], name: string): number | undefined {
  const raw = option(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
