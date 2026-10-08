import { Inject, Injectable } from "@nestjs/common";
import type { BackgroundJob, PrismaClient } from "@relationship/db";
import { parseConnectorSyncJobPayload, QueueName } from "@relationship/queue";

import { ConnectorSyncProcessor } from "./connector-sync.processor";
import {
  DurableJobWorker,
  WORKER_RUNTIME_OPTIONS,
  type WorkerRuntimeOptions,
} from "./durable-job.worker";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class ConnectorSyncWorker extends DurableJobWorker {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly syncPrisma: PrismaClient,
    processor: ConnectorSyncProcessor,
    @Inject(WORKER_RUNTIME_OPTIONS) runtime: WorkerRuntimeOptions,
  ) {
    super(syncPrisma, processor, runtime, {
      jobLabel: "Connector sync",
      loggerName: "worker:connector-sync",
      queueName: QueueName.ConnectorSync,
    });
  }

  protected override async afterLeaseRecovery(
    job: BackgroundJob,
    deadLettered: boolean,
  ): Promise<void> {
    const payload = parseConnectorSyncJobPayload(job.payload);
    await this.syncPrisma.connectorRun.updateMany({
      data: {
        failureReason: deadLettered
          ? "Worker lease expired after the final attempt"
          : "Worker lease expired; retry scheduled",
        finishedAt: deadLettered ? new Date() : null,
        status: deadLettered ? "failed" : "queued",
      },
      where: {
        connectorAccountId: payload.connectorAccountId,
        id: payload.connectorRunId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });
  }
}
