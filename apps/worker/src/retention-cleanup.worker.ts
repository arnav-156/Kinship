import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";

import {
  DurableJobWorker,
  WORKER_RUNTIME_OPTIONS,
  type WorkerRuntimeOptions,
} from "./durable-job.worker";
import { RetentionCleanupProcessor } from "./retention-cleanup.processor";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class RetentionCleanupWorker extends DurableJobWorker {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) prisma: PrismaClient,
    processor: RetentionCleanupProcessor,
    @Inject(WORKER_RUNTIME_OPTIONS) runtime: WorkerRuntimeOptions,
  ) {
    super(prisma, processor, runtime, {
      jobLabel: "Retention cleanup",
      loggerName: "worker:retention-cleanup",
      queueName: QueueName.RetentionCleanup,
    });
  }
}
