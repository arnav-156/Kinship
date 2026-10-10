import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import { Module } from "@nestjs/common";
import { createModelGateway, type ModelGatewayOptions } from "@relationship/ai";
import { loadConfig } from "@relationship/config";
import { createDefaultConnectorRegistry } from "@relationship/connectors";
import { getPrismaClient } from "@relationship/db";
import { createS3ObjectStorage } from "@relationship/storage";

import { BriefGenerationProcessor } from "./brief-generation.processor";
import { BriefGenerationWorker } from "./brief-generation.worker";
import { ConnectorSyncProcessor } from "./connector-sync.processor";
import { ConnectorSyncWorker } from "./connector-sync.worker";
import { DraftGenerationProcessor } from "./draft-generation.processor";
import { DraftGenerationWorker } from "./draft-generation.worker";
import { EvidenceIngestionProcessor } from "./evidence-ingestion.processor";
import { EvidenceIngestionWorker, WORKER_RUNTIME_OPTIONS } from "./evidence-ingestion.worker";
import { RetentionCleanupProcessor } from "./retention-cleanup.processor";
import { RetentionCleanupWorker } from "./retention-cleanup.worker";
import { WORKER_MODEL_GATEWAY } from "./worker-ai.token";
import { WORKER_CONNECTOR_REGISTRY } from "./worker-connectors.token";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";
import { WorkerService } from "./worker.service";
import { WORKER_OBJECT_STORAGE } from "./worker-storage.token";

@Module({
  providers: [
    {
      provide: WORKER_PRISMA_CLIENT,
      useFactory: getPrismaClient,
    },
    {
      provide: WORKER_MODEL_GATEWAY,
      useFactory: () => {
        const config = loadConfig();
        const options: ModelGatewayOptions = {
          apiKey: config.OPENAI_API_KEY,
          baseUrl: config.OPENAI_BASE_URL,
          chatModel: config.OPENAI_CHAT_MODEL,
          embeddingModel: config.OPENAI_EMBEDDING_MODEL,
          provider: config.AI_PROVIDER,
        };
        return createModelGateway(options);
      },
    },
    {
      provide: WORKER_CONNECTOR_REGISTRY,
      useFactory: createDefaultConnectorRegistry,
    },
    {
      provide: WORKER_OBJECT_STORAGE,
      useFactory: () => {
        const config = loadConfig();
        return createS3ObjectStorage({
          accessKeyId: config.S3_ACCESS_KEY_ID,
          bucket: config.S3_BUCKET,
          endpoint: config.S3_ENDPOINT,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
          region: config.S3_REGION,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY,
        });
      },
    },
    {
      provide: WORKER_RUNTIME_OPTIONS,
      useFactory: () => {
        const config = loadConfig();
        return {
          concurrency: config.WORKER_CONCURRENCY,
          leaseMs: config.WORKER_LEASE_MS,
          pollIntervalMs: config.WORKER_POLL_INTERVAL_MS,
          workerId: `${hostname()}:${process.pid}:${randomUUID()}`,
        };
      },
    },
    BriefGenerationProcessor,
    BriefGenerationWorker,
    ConnectorSyncProcessor,
    ConnectorSyncWorker,
    DraftGenerationProcessor,
    DraftGenerationWorker,
    EvidenceIngestionProcessor,
    EvidenceIngestionWorker,
    RetentionCleanupProcessor,
    RetentionCleanupWorker,
    WorkerService,
  ],
})
export class WorkerModule {}
