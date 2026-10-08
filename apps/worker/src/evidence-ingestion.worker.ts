import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";

import {
  DurableJobWorker,
  WORKER_RUNTIME_OPTIONS,
  type WorkerRuntimeOptions,
} from "./durable-job.worker";
import { EvidenceIngestionProcessor } from "./evidence-ingestion.processor";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

export { retryDelayMs, WORKER_RUNTIME_OPTIONS } from "./durable-job.worker";
export type { WorkerRuntimeOptions } from "./durable-job.worker";

@Injectable()
export class EvidenceIngestionWorker extends DurableJobWorker {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) prisma: PrismaClient,
    processor: EvidenceIngestionProcessor,
    @Inject(WORKER_RUNTIME_OPTIONS) runtime: WorkerRuntimeOptions,
  ) {
    super(prisma, processor, runtime, {
      jobLabel: "Evidence",
      loggerName: "worker:evidence-ingestion",
      queueName: QueueName.EvidenceIngestion,
    });
  }
}
