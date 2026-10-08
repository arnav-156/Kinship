export type EmbeddingMaintenanceMode = "backfill" | "reindex";

export interface EvidenceEmbeddingRecord {
  evidenceId: string;
  evidenceSummary: string;
  tenantId: string;
  workspaceId: string;
}

export interface EmbeddingMaintenanceConfig {
  batchSize: number;
  expectedDimensions: number;
  mode: EmbeddingMaintenanceMode;
  model: string;
  tenantId?: string;
  timeoutMs?: number;
  workspaceId?: string;
}

export interface EmbeddingCheckpoint {
  afterEvidenceId?: string;
  batchSize: number;
  completedAt?: string;
  error?: string;
  expectedDimensions: number;
  mode: EmbeddingMaintenanceMode;
  model: string;
  schemaVersion: 1;
  startedAt: string;
  status: "complete" | "failed" | "paused" | "running";
  tenantId?: string;
  totalProcessed: number;
  updatedAt: string;
  workspaceId?: string;
}

export interface EmbeddingMaintenanceResult {
  candidateCountAtStart: number;
  checkpoint?: EmbeddingCheckpoint;
  dryRun: boolean;
  indexRebuilt: boolean;
  processedThisRun: number;
}

export interface EvidenceEmbeddingStore {
  countCandidates(config: EmbeddingMaintenanceConfig): Promise<number>;
  fetchBatch(
    config: EmbeddingMaintenanceConfig,
    afterEvidenceId: string | undefined,
    limit: number,
  ): Promise<EvidenceEmbeddingRecord[]>;
  rebuildVectorIndex(): Promise<void>;
  writeEmbedding(record: EvidenceEmbeddingRecord, embedding: number[]): Promise<void>;
}

export interface EmbeddingGateway {
  embedText(request: {
    input: string;
    timeoutMs?: number;
  }): Promise<{ dimensions: number; embedding: number[]; model: string; provider: string }>;
}

export interface EmbeddingCheckpointStore {
  load(): Promise<EmbeddingCheckpoint | undefined>;
  save(checkpoint: EmbeddingCheckpoint): Promise<void>;
}

export class EmbeddingMaintenanceRunner {
  constructor(
    private readonly evidenceStore: EvidenceEmbeddingStore,
    private readonly gateway: EmbeddingGateway,
    private readonly checkpointStore: EmbeddingCheckpointStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(
    configValue: EmbeddingMaintenanceConfig,
    options: { dryRun?: boolean; maxItems?: number; resume?: boolean } = {},
  ): Promise<EmbeddingMaintenanceResult> {
    const config = validateConfig(configValue);
    const maxItems = validateMaxItems(options.maxItems);
    const candidateCountAtStart = await this.evidenceStore.countCandidates(config);
    if (options.dryRun) {
      return {
        candidateCountAtStart,
        dryRun: true,
        indexRebuilt: false,
        processedThisRun: 0,
      };
    }

    const existing = await this.checkpointStore.load();
    let checkpoint: EmbeddingCheckpoint;
    if (options.resume) {
      if (!existing) {
        throw new EmbeddingMaintenanceError("Cannot resume because the checkpoint does not exist");
      }
      assertCompatibleCheckpoint(existing, config);
      if (existing.status === "complete") {
        throw new EmbeddingMaintenanceError("Cannot resume a completed checkpoint");
      }
      checkpoint = {
        ...existing,
        error: undefined,
        status: "running",
        updatedAt: timestamp(this.now),
      };
    } else {
      if (existing) {
        throw new EmbeddingMaintenanceError(
          "Checkpoint already exists; use --resume or choose a new checkpoint path",
        );
      }
      const startedAt = timestamp(this.now);
      checkpoint = {
        batchSize: config.batchSize,
        expectedDimensions: config.expectedDimensions,
        mode: config.mode,
        model: config.model,
        schemaVersion: 1,
        startedAt,
        status: "running",
        tenantId: config.tenantId,
        totalProcessed: 0,
        updatedAt: startedAt,
        workspaceId: config.workspaceId,
      };
    }
    await this.checkpointStore.save(checkpoint);

    let processedThisRun = 0;
    try {
      while (maxItems === undefined || processedThisRun < maxItems) {
        const remaining = maxItems === undefined ? config.batchSize : maxItems - processedThisRun;
        const batch = await this.evidenceStore.fetchBatch(
          config,
          checkpoint.afterEvidenceId,
          Math.min(config.batchSize, remaining),
        );
        if (batch.length === 0) {
          let indexRebuilt = false;
          if (config.mode === "reindex") {
            await this.evidenceStore.rebuildVectorIndex();
            indexRebuilt = true;
          }
          checkpoint = {
            ...checkpoint,
            completedAt: timestamp(this.now),
            status: "complete",
            updatedAt: timestamp(this.now),
          };
          await this.checkpointStore.save(checkpoint);
          return {
            candidateCountAtStart,
            checkpoint,
            dryRun: false,
            indexRebuilt,
            processedThisRun,
          };
        }

        for (const record of batch) {
          const response = await this.gateway.embedText({
            input: record.evidenceSummary,
            timeoutMs: config.timeoutMs,
          });
          validateEmbedding(response.embedding, response.dimensions, config.expectedDimensions);
          await this.evidenceStore.writeEmbedding(record, response.embedding);
          processedThisRun += 1;
          checkpoint = {
            ...checkpoint,
            afterEvidenceId: record.evidenceId,
            status: "running",
            totalProcessed: checkpoint.totalProcessed + 1,
            updatedAt: timestamp(this.now),
          };
          await this.checkpointStore.save(checkpoint);
        }
      }

      checkpoint = {
        ...checkpoint,
        status: "paused",
        updatedAt: timestamp(this.now),
      };
      await this.checkpointStore.save(checkpoint);
      return {
        candidateCountAtStart,
        checkpoint,
        dryRun: false,
        indexRebuilt: false,
        processedThisRun,
      };
    } catch (error) {
      checkpoint = {
        ...checkpoint,
        error: error instanceof Error ? error.message : String(error),
        status: "failed",
        updatedAt: timestamp(this.now),
      };
      await this.checkpointStore.save(checkpoint);
      throw error;
    }
  }
}

export class EmbeddingMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingMaintenanceError";
  }
}

function validateConfig(value: EmbeddingMaintenanceConfig): EmbeddingMaintenanceConfig {
  if (!["backfill", "reindex"].includes(value.mode)) {
    throw new EmbeddingMaintenanceError("Mode must be backfill or reindex");
  }
  if (!Number.isInteger(value.batchSize) || value.batchSize < 1 || value.batchSize > 500) {
    throw new EmbeddingMaintenanceError("batchSize must be an integer from 1 to 500");
  }
  if (!Number.isInteger(value.expectedDimensions) || value.expectedDimensions < 1) {
    throw new EmbeddingMaintenanceError("expectedDimensions must be a positive integer");
  }
  if (!value.model.trim()) {
    throw new EmbeddingMaintenanceError("model must be non-empty");
  }
  if (value.workspaceId && !value.tenantId) {
    throw new EmbeddingMaintenanceError("workspaceId requires tenantId scope");
  }
  if (
    value.timeoutMs !== undefined &&
    (!Number.isInteger(value.timeoutMs) || value.timeoutMs < 1)
  ) {
    throw new EmbeddingMaintenanceError("timeoutMs must be a positive integer");
  }
  return { ...value };
}

function validateMaxItems(value: number | undefined): number | undefined {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new EmbeddingMaintenanceError("maxItems must be a positive integer");
  }
  return value;
}

function assertCompatibleCheckpoint(
  checkpoint: EmbeddingCheckpoint,
  config: EmbeddingMaintenanceConfig,
): void {
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.mode !== config.mode ||
    checkpoint.batchSize !== config.batchSize ||
    checkpoint.expectedDimensions !== config.expectedDimensions ||
    checkpoint.model !== config.model ||
    checkpoint.tenantId !== config.tenantId ||
    checkpoint.workspaceId !== config.workspaceId
  ) {
    throw new EmbeddingMaintenanceError("Checkpoint configuration does not match this run");
  }
}

function validateEmbedding(
  embedding: number[],
  reportedDimensions: number,
  expectedDimensions: number,
): void {
  if (
    reportedDimensions !== embedding.length ||
    embedding.length !== expectedDimensions ||
    embedding.some((value) => !Number.isFinite(value))
  ) {
    throw new EmbeddingMaintenanceError(
      `Embedding dimensions must be ${expectedDimensions} finite values; provider returned ${reportedDimensions}/${embedding.length}`,
    );
  }
}

function timestamp(now: () => Date): string {
  return now().toISOString();
}
