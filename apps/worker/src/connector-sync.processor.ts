import { Inject, Injectable } from "@nestjs/common";
import type { ModelGateway } from "@relationship/ai";
import type { SourceConnector } from "@relationship/connectors";
import type { PrismaClient, SourceType } from "@relationship/db";
import { parseConnectorSyncJobPayload } from "@relationship/queue";
import type { ObjectStoragePort } from "@relationship/storage";

import { EvidenceIngestionProcessor } from "./evidence-ingestion.processor";
import { WORKER_CONNECTOR_REGISTRY } from "./worker-connectors.token";
import { WORKER_MODEL_GATEWAY } from "./worker-ai.token";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";
import { WORKER_OBJECT_STORAGE } from "./worker-storage.token";

@Injectable()
export class ConnectorSyncProcessor extends EvidenceIngestionProcessor {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly syncPrisma: PrismaClient,
    @Inject(WORKER_CONNECTOR_REGISTRY) registry: Map<SourceType, SourceConnector>,
    @Inject(WORKER_OBJECT_STORAGE) objectStorage: ObjectStoragePort,
    @Inject(WORKER_MODEL_GATEWAY) modelGateway?: ModelGateway,
  ) {
    super(syncPrisma, registry, objectStorage, modelGateway);
  }

  override async process(
    job: Parameters<EvidenceIngestionProcessor["process"]>[0],
    workerId: string,
  ) {
    try {
      await super.process(job, workerId);
    } catch (error) {
      const payload = parseConnectorSyncJobPayload(job.payload);
      const finalAttempt = job.attempts >= job.maxAttempts;
      await this.syncPrisma.connectorRun.updateMany({
        data: {
          failureReason: sanitizeFailureReason(error),
          finishedAt: finalAttempt ? new Date() : null,
          status: finalAttempt ? "failed" : "queued",
        },
        where: {
          connectorAccountId: payload.connectorAccountId,
          id: payload.connectorRunId,
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      throw error;
    }
  }
}

function sanitizeFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown connector failure";
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
