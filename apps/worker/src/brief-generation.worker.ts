import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";

import { BriefGenerationProcessor } from "./brief-generation.processor";
import {
  DurableJobWorker,
  WORKER_RUNTIME_OPTIONS,
  type WorkerRuntimeOptions,
} from "./durable-job.worker";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class BriefGenerationWorker extends DurableJobWorker {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) prisma: PrismaClient,
    processor: BriefGenerationProcessor,
    @Inject(WORKER_RUNTIME_OPTIONS) runtime: WorkerRuntimeOptions,
  ) {
    super(prisma, processor, runtime, {
      jobLabel: "Brief generation",
      loggerName: "worker:brief-generation",
      queueName: QueueName.BriefGeneration,
    });
  }
}
