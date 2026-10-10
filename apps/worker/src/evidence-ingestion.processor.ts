import { Inject, Injectable } from "@nestjs/common";
import { getConnector } from "@relationship/connectors";
import type { SourceConnector } from "@relationship/connectors";
import type { BackgroundJob, Prisma, PrismaClient, SourceType } from "@relationship/db";
import {
  parseConnectorSyncJobPayload,
  parseEvidenceIngestionJobPayload,
  QueueName,
  type EvidenceIngestionJobPayload,
} from "@relationship/queue";
import type { ObjectStoragePort } from "@relationship/storage";

import { WORKER_CONNECTOR_REGISTRY } from "./worker-connectors.token";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";
import { WORKER_OBJECT_STORAGE } from "./worker-storage.token";

@Injectable()
export class EvidenceIngestionProcessor {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(WORKER_CONNECTOR_REGISTRY)
    private readonly connectorRegistry: Map<SourceType, SourceConnector>,
    @Inject(WORKER_OBJECT_STORAGE) private readonly objectStorage: ObjectStoragePort,
  ) {}

  async process(job: BackgroundJob, workerId: string): Promise<void> {
    const syncPayload =
      job.queueName === QueueName.ConnectorSync
        ? parseConnectorSyncJobPayload(job.payload)
        : undefined;
    const payload: EvidenceIngestionJobPayload = syncPayload
      ? {
          entityId: syncPayload.entityId,
          requestedByUserId: syncPayload.requestedByUserId,
          sourceIdentifier: syncPayload.sourceIdentifier,
          sourceType: syncPayload.provider,
          subjectName: syncPayload.subjectName,
          tenantId: syncPayload.tenantId,
          workspaceId: syncPayload.workspaceId,
        }
      : parseEvidenceIngestionJobPayload(job.payload);
    if (payload.tenantId !== job.tenantId || payload.workspaceId !== job.workspaceId) {
      throw new Error("Stored ingestion payload does not match its job scope");
    }

    if (syncPayload) {
      const running = await this.prisma.connectorRun.updateMany({
        data: { failureReason: null, finishedAt: null, startedAt: new Date(), status: "running" },
        where: {
          connectorAccountId: syncPayload.connectorAccountId,
          id: syncPayload.connectorRunId,
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      if (running.count !== 1) throw new Error("Connector run was not found in this workspace");
      const account = await this.prisma.connectorAccount.findFirst({
        select: { id: true, provider: true },
        where: {
          id: syncPayload.connectorAccountId,
          provider: syncPayload.provider,
          status: "active",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      if (!account) throw new Error("Connector account is not active in this workspace");
    }

    const connector = getConnector(this.connectorRegistry, payload.sourceType);
    await this.updateProgress(job.id, workerId, 10, "checking_policy");
    const policy = await connector.checkPolicy({
      context: payload.context,
      sourceIdentifier: payload.sourceIdentifier,
      tenantId: payload.tenantId,
      timeoutMs: 10_000,
      workspaceId: payload.workspaceId,
    });

    await this.updateProgress(job.id, workerId, 30, "fetching_source");
    const fetchResult = await connector.fetch({
      context: payload.context,
      sourceIdentifier: payload.sourceIdentifier,
      tenantId: payload.tenantId,
      timeoutMs: 10_000,
      workspaceId: payload.workspaceId,
    });

    await this.updateProgress(job.id, workerId, 55, "normalizing_source");
    const document = await connector.normalize(fetchResult);
    await this.updateProgress(job.id, workerId, 70, "extracting_evidence");
    const evidenceResults = await connector.extractEvidence(document);
    if (evidenceResults.length === 0) {
      throw new Error("Connector returned no evidence");
    }

    const retrievalTimestamp = new Date(fetchResult.retrievedAt);
    const retentionPolicy = await this.prisma.retentionPolicy.findUnique({
      where: {
        tenantId_workspaceId_dataClass: {
          dataClass: "evidence",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      },
    });
    const retentionExpiresAt = retentionPolicy?.enabled
      ? new Date(
          retrievalTimestamp.getTime() + retentionPolicy.retentionDays * 24 * 60 * 60 * 1_000,
        )
      : null;
    const storedSnapshot = await this.objectStorage.putSnapshot({
      body: new TextEncoder().encode(fetchResult.rawText),
      contentHash: fetchResult.contentHash,
      contentType: fetchResult.contentType,
      policyStatus: policy.policyStatus,
      retentionExpiresAt,
      retrievalTimestamp,
      sourceType: fetchResult.sourceType,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
    });

    await this.updateProgress(job.id, workerId, 80, "saving_evidence");
    await this.prisma.$transaction(async (tx) => {
      const entityId = await this.resolveEntityId(tx, payload);

      const snapshot = await tx.sourceSnapshot.upsert({
        create: {
          contentType: fetchResult.contentType,
          policyStatus: policy.policyStatus,
          rawContentHash: fetchResult.contentHash,
          retentionExpiresAt,
          retrievalTimestamp,
          sourceIdentifier: fetchResult.sourceIdentifier,
          sourceType: fetchResult.sourceType as SourceType,
          sourceUrl: fetchResult.sourceUrl,
          storageKey: storedSnapshot.key,
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
        update: {
          contentType: fetchResult.contentType,
          policyStatus: policy.policyStatus,
          retentionExpiresAt,
          retrievalTimestamp,
          storageKey: storedSnapshot.key,
        },
        where: {
          tenantId_workspaceId_rawContentHash: {
            rawContentHash: fetchResult.contentHash,
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        },
      });

      const evidenceItemIds: string[] = [];
      for (const evidence of evidenceResults) {
        const item = await tx.evidenceItem.create({
          data: {
            confidenceScore: evidence.confidenceScore,
            entityId,
            evidenceSummary: evidence.evidenceSummary,
            freshnessScore: evidence.freshnessScore,
            metadata: evidence.metadata as Prisma.InputJsonValue,
            policyStatus: policy.policyStatus,
            rawContentHash: fetchResult.contentHash,
            retentionExpiresAt,
            retrievalTimestamp,
            sourceIdentifier: fetchResult.sourceIdentifier,
            sourceSnapshotId: snapshot.id,
            sourceType: fetchResult.sourceType as SourceType,
            sourceUrl: fetchResult.sourceUrl,
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        });
        evidenceItemIds.push(item.id);
      }

      const completed = await tx.backgroundJob.updateMany({
        data: {
          completedAt: new Date(),
          failureReason: null,
          lockedAt: null,
          lockedBy: null,
          progress: {
            ...(syncPayload
              ? {
                  connectorRunId: syncPayload.connectorRunId,
                  trigger: syncPayload.trigger ?? "manual",
                }
              : {}),
            entityId,
            evidenceItemCount: evidenceItemIds.length,
            evidenceItemIds,
            percent: 100,
            sourceSnapshotId: snapshot.id,
            stage: "completed",
          },
          status: "completed",
        },
        where: {
          id: job.id,
          lockedBy: workerId,
          status: "active",
        },
      });
      if (completed.count !== 1) {
        throw new Error("Evidence job lease was lost before completion");
      }

      if (syncPayload) {
        const completedRun = await tx.connectorRun.updateMany({
          data: {
            failureReason: null,
            finishedAt: new Date(),
            metadata: {
              entityId,
              evidenceItemCount: evidenceItemIds.length,
              sourceSnapshotId: snapshot.id,
              trigger: syncPayload.trigger ?? "manual",
            },
            status: "succeeded",
          },
          where: {
            connectorAccountId: syncPayload.connectorAccountId,
            id: syncPayload.connectorRunId,
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        });
        if (completedRun.count !== 1) {
          throw new Error("Connector run was lost before completion");
        }
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: payload.requestedByUserId,
          eventType: "evidence.ingested",
          metadata: {
            evidenceItemCount: evidenceItemIds.length,
            jobId: job.id,
            policyStatus: policy.policyStatus,
            sourceType: payload.sourceType,
          },
          subjectId: entityId,
          subjectType: "entity",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      if (syncPayload) {
        await tx.auditEvent.create({
          data: {
            actorUserId: payload.requestedByUserId,
            eventType: "connector_sync.completed",
            metadata: {
              evidenceItemCount: evidenceItemIds.length,
              jobId: job.id,
              provider: syncPayload.provider,
              trigger: syncPayload.trigger ?? "manual",
            },
            subjectId: syncPayload.connectorRunId,
            subjectType: "connector_run",
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        });
      }
    });
  }

  private async resolveEntityId(
    tx: Prisma.TransactionClient,
    payload: EvidenceIngestionJobPayload,
  ): Promise<string> {
    if (!payload.entityId) {
      return (
        await tx.entity.create({
          data: {
            canonicalName: payload.subjectName ?? deriveSubjectName(payload.sourceIdentifier),
            confidenceScore: payload.subjectName ? 0.8 : 0.45,
            tenantId: payload.tenantId,
            type: "other",
            workspaceId: payload.workspaceId,
          },
        })
      ).id;
    }

    const entity = await tx.entity.findFirst({
      select: { id: true },
      where: {
        deletedAt: null,
        id: payload.entityId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });
    if (!entity) {
      throw new Error("Entity was not found in this workspace");
    }
    return entity.id;
  }

  private async updateProgress(
    jobId: string,
    workerId: string,
    percent: number,
    stage: string,
  ): Promise<void> {
    const updated = await this.prisma.backgroundJob.updateMany({
      data: {
        lockedAt: new Date(),
        progress: { percent, stage },
      },
      where: {
        id: jobId,
        lockedBy: workerId,
        status: "active",
      },
    });
    if (updated.count !== 1) {
      throw new Error("Evidence job lease was lost during processing");
    }
  }
}

function deriveSubjectName(sourceIdentifier: string): string {
  try {
    return new URL(sourceIdentifier).hostname;
  } catch {
    return sourceIdentifier.slice(0, 120);
  }
}
