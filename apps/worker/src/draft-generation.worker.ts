import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";

import {
  DurableJobWorker,
  WORKER_RUNTIME_OPTIONS,
  type WorkerRuntimeOptions,
} from "./durable-job.worker";
import { DraftGenerationProcessor } from "./draft-generation.processor";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class DraftGenerationWorker extends DurableJobWorker {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) prisma: PrismaClient,
    processor: DraftGenerationProcessor,
    @Inject(WORKER_RUNTIME_OPTIONS) runtime: WorkerRuntimeOptions,
  ) {
    super(prisma, processor, runtime, {
      jobLabel: "Draft generation",
      loggerName: "worker:draft-generation",
      queueName: QueueName.DraftGeneration,
    });
  }
}
