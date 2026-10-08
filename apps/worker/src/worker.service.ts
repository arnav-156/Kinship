import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { loadConfig } from "@relationship/config";
import { disconnectPrismaClient } from "@relationship/db";
import { createLogger } from "@relationship/logger";

import { BriefGenerationWorker } from "./brief-generation.worker";
import { ConnectorSyncWorker } from "./connector-sync.worker";
import { DraftGenerationWorker } from "./draft-generation.worker";
import { EvidenceIngestionWorker } from "./evidence-ingestion.worker";
import { RetentionCleanupWorker } from "./retention-cleanup.worker";

@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly config = loadConfig();
  private readonly logger = createLogger("worker", this.config.LOG_LEVEL);
  private heartbeat?: NodeJS.Timeout;

  constructor(
    private readonly evidenceIngestionWorker: EvidenceIngestionWorker,
    private readonly briefGenerationWorker: BriefGenerationWorker,
    private readonly draftGenerationWorker: DraftGenerationWorker,
    private readonly connectorSyncWorker: ConnectorSyncWorker,
    private readonly retentionCleanupWorker: RetentionCleanupWorker,
  ) {}

  onApplicationBootstrap(): void {
    this.logger.info("Worker started", {
      concurrency: this.config.WORKER_CONCURRENCY,
      connectorQueue: this.connectorSyncWorker.queueName,
      briefQueue: this.briefGenerationWorker.queueName,
      draftQueue: this.draftGenerationWorker.queueName,
      evidenceQueue: this.evidenceIngestionWorker.queueName,
      retentionQueue: this.retentionCleanupWorker.queueName,
      leaseMs: this.config.WORKER_LEASE_MS,
      pollIntervalMs: this.config.WORKER_POLL_INTERVAL_MS,
    });

    this.heartbeat = setInterval(() => {
      this.logger.debug("Worker heartbeat");
    }, 60_000);
    this.heartbeat.unref();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    await disconnectPrismaClient();

    this.logger.info("Worker stopped", { signal });
  }
}
