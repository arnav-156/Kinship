import { randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ConnectorError,
  ConnectorPolicyError,
  createDefaultConnectorRegistry,
  getConnector,
} from "@relationship/connectors";
import type { SourceConnector } from "@relationship/connectors";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Prisma, PrismaClient, SourceType } from "@relationship/db";
import { QueueName, type EvidenceIngestionJobPayload } from "@relationship/queue";
import { canPerformWorkspaceAction } from "@relationship/policy";
import type { ObjectStoragePort } from "@relationship/storage";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import { calculateRetentionExpiration } from "../retention/retention.utils";
import { OBJECT_STORAGE } from "../storage/object-storage.token";
import type {
  AnalyzeUrlDto,
  EvidenceSourceType,
  IngestEvidenceDto,
  RecordRelationshipOutcomeDto,
} from "./dto";

const connectorRegistry = createDefaultConnectorRegistry();
const relationshipActivityTypes = [
  "brief",
  "draft",
  "evidence",
  "note",
  "outcome",
  "policy",
] as const;
type RelationshipActivityType = (typeof relationshipActivityTypes)[number];
type RelationshipActivity = {
  actor?: { displayName: null | string; email: string; id: string } | null;
  at: Date;
  id: string;
  metadata?: Record<string, unknown>;
  sourceId: string;
  status?: string;
  summary: string;
  title: string;
  type: RelationshipActivityType;
};
type TimelineCursor = { at: Date; id: string };

const backgroundJobStatusSelect = {
  attempts: true,
  createdAt: true,
  failureReason: true,
  id: true,
  jobName: true,
  maxAttempts: true,
  progress: true,
  queueName: true,
  status: true,
  updatedAt: true,
} as const;

@Injectable()
export class EvidenceService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    @Inject(OBJECT_STORAGE) private readonly objectStorage?: ObjectStoragePort,
  ) {}

  analyzeUrl(principal: AuthenticatedPrincipal, input: AnalyzeUrlDto) {
    const sourceType = input.sourceType ?? inferSourceType(input.url);
    return this.ingest(principal, {
      sourceIdentifier: input.url,
      sourceType,
      subjectName: input.subjectName,
      workspaceId: input.workspaceId,
    });
  }

  async ingest(principal: AuthenticatedPrincipal, input: IngestEvidenceDto) {
    return this.executeIngestion(principal, input);
  }

  private async executeIngestion(
    principal: AuthenticatedPrincipal,
    input: IngestEvidenceDto,
    trackingJobId?: string,
  ) {
    this.assertCanUseWorkspace(principal, input.workspaceId);
    const connector = getConnector(connectorRegistry, input.sourceType);
    const payload: EvidenceIngestionJobPayload = {
      context: input.context,
      entityId: input.entityId,
      sourceIdentifier: input.sourceIdentifier,
      sourceType: input.sourceType,
      requestedByUserId: principal.userId,
      subjectName: input.subjectName,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    };

    try {
      await this.updateJobProgress(trackingJobId, 10, "checking_policy");
      const policy = await connector.checkPolicy({
        context: input.context,
        sourceIdentifier: input.sourceIdentifier,
        tenantId: principal.tenantId,
        timeoutMs: 10_000,
        workspaceId: input.workspaceId,
      });
      await this.updateJobProgress(trackingJobId, 30, "fetching_source");
      const fetchResult = await connector.fetch({
        context: input.context,
        sourceIdentifier: input.sourceIdentifier,
        tenantId: principal.tenantId,
        timeoutMs: 10_000,
        workspaceId: input.workspaceId,
      });
      await this.updateJobProgress(trackingJobId, 55, "normalizing_source");
      const document = await connector.normalize(fetchResult);
      await this.updateJobProgress(trackingJobId, 70, "extracting_evidence");
      const evidenceResults = await connector.extractEvidence(document);

      if (evidenceResults.length === 0) {
        throw new BadRequestException("Connector returned no evidence");
      }

      const retrievalTimestamp = new Date(fetchResult.retrievedAt);
      const retentionPolicy = await this.prisma.retentionPolicy.findUnique({
        where: {
          tenantId_workspaceId_dataClass: {
            dataClass: "evidence",
            tenantId: principal.tenantId,
            workspaceId: input.workspaceId,
          },
        },
      });
      const retentionExpiresAt = calculateRetentionExpiration(retrievalTimestamp, retentionPolicy);
      if (!this.objectStorage) throw new Error("Object storage is not configured");
      const storedSnapshot = await this.objectStorage.putSnapshot({
        body: new TextEncoder().encode(fetchResult.rawText),
        contentHash: fetchResult.contentHash,
        contentType: fetchResult.contentType,
        policyStatus: policy.policyStatus,
        retentionExpiresAt,
        retrievalTimestamp,
        sourceType: fetchResult.sourceType,
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      });

      return await this.prisma.$transaction(async (tx) => {
        const job = trackingJobId
          ? await tx.backgroundJob.findFirstOrThrow({
              where: {
                id: trackingJobId,
                tenantId: principal.tenantId,
                workspaceId: input.workspaceId,
              },
            })
          : await tx.backgroundJob.upsert({
              create: {
                attempts: 1,
                idempotencyKey: fetchResult.contentHash,
                jobName: "evidence.ingest",
                payload: toJson(payload),
                queueName: QueueName.EvidenceIngestion,
                status: "active",
                tenantId: principal.tenantId,
                workspaceId: input.workspaceId,
              },
              update: {
                attempts: {
                  increment: 1,
                },
                failureReason: null,
                payload: toJson(payload),
                progress: {
                  percent: 80,
                  stage: "saving_evidence",
                },
                status: "active",
              },
              where: {
                tenantId_queueName_idempotencyKey: {
                  idempotencyKey: fetchResult.contentHash,
                  queueName: QueueName.EvidenceIngestion,
                  tenantId: principal.tenantId,
                },
              },
            });

        const entityId =
          input.entityId ??
          (
            await tx.entity.create({
              data: {
                canonicalName: input.subjectName ?? deriveSubjectName(input.sourceIdentifier),
                confidenceScore: input.subjectName ? 0.8 : 0.45,
                tenantId: principal.tenantId,
                type: "other",
                workspaceId: input.workspaceId,
              },
            })
          ).id;

        const entity = await tx.entity.findFirst({
          where: {
            deletedAt: null,
            id: entityId,
            tenantId: principal.tenantId,
            workspaceId: input.workspaceId,
          },
        });

        if (!entity) {
          throw new NotFoundException("Entity was not found in this workspace");
        }

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
            tenantId: principal.tenantId,
            workspaceId: input.workspaceId,
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
              tenantId: principal.tenantId,
              workspaceId: input.workspaceId,
            },
          },
        });

        const evidenceItems = [];
        for (const evidence of evidenceResults) {
          evidenceItems.push(
            await tx.evidenceItem.create({
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
                tenantId: principal.tenantId,
                workspaceId: input.workspaceId,
              },
            }),
          );
        }

        await tx.backgroundJob.update({
          data: {
            completedAt: new Date(),
            failureReason: null,
            lockedAt: null,
            lockedBy: null,
            progress: {
              entityId,
              evidenceItemCount: evidenceItems.length,
              evidenceItemIds: evidenceItems.map((item) => item.id),
              percent: 100,
              sourceSnapshotId: snapshot.id,
              stage: "completed",
            },
            status: "completed",
          },
          where: {
            id: job.id,
          },
        });

        await this.auditService.record(
          {
            actorUserId: principal.userId,
            eventType: "evidence.ingested",
            metadata: {
              evidenceItemCount: evidenceItems.length,
              policyStatus: policy.policyStatus,
              sourceType: input.sourceType,
            },
            subjectId: entityId,
            subjectType: "entity",
            tenantId: principal.tenantId,
            workspaceId: input.workspaceId,
          },
          tx,
        );

        return {
          backgroundJobId: job.id,
          entityId,
          evidenceItemIds: evidenceItems.map((item) => item.id),
          policyStatus: policy.policyStatus,
          sourceSnapshotId: snapshot.id,
        };
      });
    } catch (error) {
      if (!trackingJobId) await this.recordFailure(principal, input, connector, payload, error);
      if (error instanceof ConnectorPolicyError) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof ConnectorError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  async listEntityEvidence(principal: AuthenticatedPrincipal, entityId: string) {
    const entity = await this.prisma.entity.findFirst({
      where: {
        deletedAt: null,
        id: entityId,
        tenantId: principal.tenantId,
      },
    });

    if (!entity) {
      throw new NotFoundException("Entity was not found");
    }

    this.assertCanUseWorkspace(principal, entity.workspaceId);

    return this.prisma.evidenceItem.findMany({
      orderBy: {
        retrievalTimestamp: "desc",
      },
      where: {
        entityId,
        tenantId: principal.tenantId,
        workspaceId: entity.workspaceId,
      },
    });
  }

  async relationshipTimeline(
    principal: AuthenticatedPrincipal,
    entityId: string,
    query: { cursor?: string; limit?: string; types?: string } = {},
  ) {
    const entity = await this.requireReadableEntity(principal, entityId);
    const limit = parseTimelineLimit(query.limit);
    const cursor = parseTimelineCursor(query.cursor);
    const selectedTypes = parseTimelineTypes(query.types);
    const take = limit + 1;
    const dateBoundary = cursor ? { lte: cursor.at } : undefined;

    const [evidence, notes, briefs, drafts, draftVersions, auditEvents] = await Promise.all([
      this.prisma.evidenceItem.findMany({
        orderBy: [{ retrievalTimestamp: "desc" }, { id: "desc" }],
        take,
        where: {
          entityId,
          retrievalTimestamp: dateBoundary,
          tenantId: principal.tenantId,
          workspaceId: entity.workspaceId,
        },
      }),
      this.prisma.relationshipNote.findMany({
        include: {
          author: { select: { displayName: true, email: true, id: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        where: {
          createdAt: dateBoundary,
          entityId,
          tenantId: principal.tenantId,
          workspaceId: entity.workspaceId,
        },
      }),
      this.prisma.relationshipBrief.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        where: {
          createdAt: dateBoundary,
          subjectEntityId: entityId,
          tenantId: principal.tenantId,
          workspaceId: entity.workspaceId,
        },
      }),
      this.prisma.draftMessage.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        where: {
          createdAt: dateBoundary,
          subjectEntityId: entityId,
          tenantId: principal.tenantId,
          workspaceId: entity.workspaceId,
        },
      }),
      this.prisma.draftMessageVersion.findMany({
        include: {
          createdBy: { select: { displayName: true, email: true, id: true } },
          draft: { select: { id: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        where: {
          createdAt: dateBoundary,
          draft: { subjectEntityId: entityId },
          tenantId: principal.tenantId,
          version: { gt: 1 },
          workspaceId: entity.workspaceId,
        },
      }),
      this.prisma.auditEvent.findMany({
        include: {
          user: { select: { displayName: true, email: true, id: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        where: {
          createdAt: dateBoundary,
          eventType: {
            in: [
              "compliance.allowed",
              "compliance.blocked",
              "compliance.warned",
              "relationship_outcome.recorded",
            ],
          },
          subjectId: entityId,
          subjectType: "entity",
          tenantId: principal.tenantId,
          workspaceId: entity.workspaceId,
        },
      }),
    ]);

    const activities: RelationshipActivity[] = [
      ...evidence.map((item) => ({
        at: item.retrievalTimestamp,
        id: `evidence:${item.id}`,
        metadata: {
          confidenceScore: item.confidenceScore,
          freshnessScore: item.freshnessScore,
          sourceType: item.sourceType,
        },
        sourceId: item.id,
        status: item.policyStatus,
        summary: item.evidenceSummary,
        title: "Evidence captured",
        type: "evidence" as const,
      })),
      ...notes.map((note) => ({
        actor: note.author,
        at: note.createdAt,
        id: `note:${note.id}`,
        metadata: { updatedAt: note.updatedAt.toISOString() },
        sourceId: note.id,
        summary: note.body,
        title:
          note.updatedAt.getTime() > note.createdAt.getTime()
            ? "Relationship note updated"
            : "Relationship note added",
        type: "note" as const,
      })),
      ...briefs.map((brief) => ({
        at: brief.createdAt,
        id: `brief:${brief.id}`,
        metadata: {
          confidenceScore: brief.confidenceScore,
          fitScore: brief.fitScore,
          goal: brief.goal,
          recommendedChannel: brief.recommendedChannel,
        },
        sourceId: brief.id,
        status: brief.channelRisk,
        summary: brief.summary,
        title: "Relationship brief generated",
        type: "brief" as const,
      })),
      ...drafts.map((draft) => ({
        at: draft.createdAt,
        id: `draft:${draft.id}:created`,
        metadata: {
          channelType: draft.channelType,
          tone: draft.tone,
          variant: draft.variant,
        },
        sourceId: draft.id,
        status: draft.status,
        summary: draft.body,
        title: "Draft generated",
        type: "draft" as const,
      })),
      ...draftVersions.map((version) => ({
        actor: version.createdBy,
        at: version.createdAt,
        id: `draft:${version.draft.id}:version:${version.id}`,
        metadata: {
          draftId: version.draft.id,
          reason: version.reason,
          version: version.version,
        },
        sourceId: version.id,
        status: version.status,
        summary: version.body,
        title: draftVersionTitle(version.reason),
        type: "draft" as const,
      })),
      ...auditEvents.map((event) => {
        const metadata = toObject(event.metadata);
        const isOutcome = event.eventType === "relationship_outcome.recorded";
        return {
          actor: event.user,
          at: event.createdAt,
          id: `${isOutcome ? "outcome" : "policy"}:${event.id}`,
          metadata,
          sourceId: event.id,
          status: readString(metadata, isOutcome ? "kind" : "decision"),
          summary:
            readString(metadata, isOutcome ? "summary" : "reason") ??
            (isOutcome ? "Relationship outcome recorded" : "Policy evaluation completed"),
          title: isOutcome
            ? outcomeTitle(readString(metadata, "kind"))
            : policyTitle(readString(metadata, "decision")),
          type: isOutcome ? ("outcome" as const) : ("policy" as const),
        };
      }),
    ];

    const sorted = activities
      .filter((activity) => selectedTypes.has(activity.type))
      .filter((activity) => isBeforeCursor(activity, cursor))
      .sort(compareActivities);
    const items = sorted.slice(0, limit);

    return {
      items,
      nextCursor:
        sorted.length > limit && items.length > 0
          ? encodeTimelineCursor(items[items.length - 1]!)
          : null,
    };
  }

  async recordRelationshipOutcome(
    principal: AuthenticatedPrincipal,
    entityId: string,
    input: RecordRelationshipOutcomeDto,
  ) {
    const entity = await this.requireReadableEntity(principal, entityId);
    const membership = principal.workspaceRoles.find(
      (role) => role.workspaceId === entity.workspaceId,
    );
    if (!membership || !canPerformWorkspaceAction(membership.role, "relationship-note:write")) {
      throw new ForbiddenException("You cannot record relationship outcomes in this workspace");
    }

    const summary = input.summary.trim();
    if (!summary) {
      throw new BadRequestException("Relationship outcome cannot be empty");
    }
    const event = await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "relationship_outcome.recorded",
      metadata: { kind: input.kind, summary },
      subjectId: entityId,
      subjectType: "entity",
      tenantId: principal.tenantId,
      workspaceId: entity.workspaceId,
    });

    return {
      actor: { displayName: null, email: principal.email, id: principal.userId },
      at: event.createdAt,
      id: `outcome:${event.id}`,
      metadata: { kind: input.kind },
      sourceId: event.id,
      status: input.kind,
      summary,
      title: outcomeTitle(input.kind),
      type: "outcome" as const,
    };
  }

  async queueIngestion(
    principal: AuthenticatedPrincipal,
    input: IngestEvidenceDto,
    idempotencyKey?: string,
  ) {
    this.assertCanUseWorkspace(principal, input.workspaceId);
    const stableIdempotencyKey = idempotencyKey?.trim() || input.sourceType + ":" + randomUUID();
    if (stableIdempotencyKey.length < 8 || stableIdempotencyKey.length > 200) {
      throw new BadRequestException("Idempotency-Key must be between 8 and 200 characters");
    }

    const payload: EvidenceIngestionJobPayload = {
      context: input.context,
      entityId: input.entityId,
      requestedByUserId: principal.userId,
      sourceIdentifier: input.sourceIdentifier,
      sourceType: input.sourceType,
      subjectName: input.subjectName,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    };
    const job = await this.prisma.backgroundJob.upsert({
      create: {
        idempotencyKey: stableIdempotencyKey,
        jobName: "evidence.ingest",
        payload: toJson(payload),
        progress: {
          percent: 0,
          stage: "queued",
        },
        queueName: QueueName.EvidenceIngestion,
        status: "queued",
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
      select: backgroundJobStatusSelect,
      update: {},
      where: {
        tenantId_queueName_idempotencyKey: {
          idempotencyKey: stableIdempotencyKey,
          queueName: QueueName.EvidenceIngestion,
          tenantId: principal.tenantId,
        },
      },
    });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "background_job.queued",
      metadata: {
        idempotencyKey: stableIdempotencyKey,
        jobName: job.jobName,
        sourceType: input.sourceType,
      },
      subjectId: job.id,
      subjectType: "background_job",
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    });

    return job;
  }

  async getWorkspaceJob(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.prisma.backgroundJob.findFirst({
      select: {
        ...backgroundJobStatusSelect,
        workspaceId: true,
      },
      where: {
        id: jobId,
        tenantId: principal.tenantId,
      },
    });
    if (!job?.workspaceId) throw new NotFoundException("Background job was not found");
    this.assertCanUseWorkspace(principal, job.workspaceId);

    const { workspaceId: _workspaceId, ...status } = job;
    return status;
  }

  async retryWorkspaceJob(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        tenantId: principal.tenantId,
      },
    });
    if (!job?.workspaceId) throw new NotFoundException("Background job was not found");
    this.assertCanUseWorkspace(principal, job.workspaceId);
    if (job.status !== "failed" && job.status !== "dead_lettered") {
      throw new ConflictException("Only failed or dead-lettered jobs can be retried");
    }

    const replay = await this.prisma.backgroundJob.update({
      data: {
        attempts: job.status === "dead_lettered" ? 0 : job.attempts,
        availableAt: new Date(),
        completedAt: null,
        failureReason: null,
        lockedAt: null,
        lockedBy: null,
        progress: {
          percent: 0,
          stage: "queued",
        },
        status: "queued",
      },
      select: backgroundJobStatusSelect,
      where: {
        id: job.id,
      },
    });

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "background_job.retry_requested",
      metadata: {
        previousAttempts: job.attempts,
        previousStatus: job.status,
      },
      subjectId: job.id,
      subjectType: "background_job",
      tenantId: principal.tenantId,
      workspaceId: job.workspaceId,
    });

    return replay;
  }

  async cancelWorkspaceJob(principal: AuthenticatedPrincipal, jobId: string) {
    const job = await this.prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        tenantId: principal.tenantId,
      },
    });
    if (!job?.workspaceId) throw new NotFoundException("Background job was not found");
    this.assertCanUseWorkspace(principal, job.workspaceId);
    if (job.status !== "queued") {
      throw new ConflictException("Only queued jobs can be canceled safely");
    }

    const canceled = await this.prisma.backgroundJob.updateMany({
      data: {
        failureReason: null,
        lockedAt: null,
        lockedBy: null,
        progress: {
          percent: 0,
          stage: "canceled",
        },
        status: "canceled",
      },
      where: {
        id: job.id,
        status: "queued",
        tenantId: principal.tenantId,
      },
    });
    if (canceled.count !== 1) {
      throw new ConflictException("The job started before it could be canceled");
    }

    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "background_job.canceled",
      subjectId: job.id,
      subjectType: "background_job",
      tenantId: principal.tenantId,
      workspaceId: job.workspaceId,
    });

    return this.getWorkspaceJob(principal, job.id);
  }

  async listWorkspaceJobs(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanUseWorkspace(principal, workspaceId);
    return this.prisma.backgroundJob.findMany({
      orderBy: {
        updatedAt: "desc",
      },
      select: backgroundJobStatusSelect,
      take: 20,
      where: {
        tenantId: principal.tenantId,
        workspaceId,
      },
    });
  }
  private async updateJobProgress(
    jobId: string | undefined,
    percent: number,
    stage: string,
  ): Promise<void> {
    if (!jobId) return;
    await this.prisma.backgroundJob.updateMany({
      data: {
        progress: {
          percent,
          stage,
        },
      },
      where: {
        id: jobId,
        status: "active",
      },
    });
  }

  private async recordFailure(
    principal: AuthenticatedPrincipal,
    input: IngestEvidenceDto,
    connector: SourceConnector,
    payload: EvidenceIngestionJobPayload,
    error: unknown,
  ): Promise<void> {
    const failureReason = error instanceof Error ? error.message : "Unknown connector failure";
    await this.prisma.backgroundJob.create({
      data: {
        failureReason,
        idempotencyKey: `${connector.sourceType}:${Date.now()}:${Math.random()}`,
        jobName: "evidence.ingest",
        payload: toJson(payload),
        queueName: QueueName.EvidenceIngestion,
        status: "failed",
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
    });
  }

  private assertCanUseWorkspace(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:read")) {
      throw new ForbiddenException("You do not have access to this workspace");
    }
  }

  private async requireReadableEntity(principal: AuthenticatedPrincipal, entityId: string) {
    const entity = await this.prisma.entity.findFirst({
      where: { deletedAt: null, id: entityId, tenantId: principal.tenantId },
    });
    if (!entity) {
      throw new NotFoundException("Entity was not found");
    }
    this.assertCanUseWorkspace(principal, entity.workspaceId);
    return entity;
  }
}

function compareActivities(left: RelationshipActivity, right: RelationshipActivity): number {
  const byDate = right.at.getTime() - left.at.getTime();
  return byDate === 0 ? right.id.localeCompare(left.id) : byDate;
}

function draftVersionTitle(reason: string): string {
  if (reason === "rewritten") return "Draft rewritten";
  if (reason === "validated") return "Draft validated";
  if (reason.startsWith("restored_")) return "Draft version restored";
  if (reason === "autosave") return "Draft autosaved";
  return "Draft updated";
}

function encodeTimelineCursor(activity: RelationshipActivity): string {
  return Buffer.from(JSON.stringify({ at: activity.at.toISOString(), id: activity.id })).toString(
    "base64url",
  );
}

function isBeforeCursor(activity: RelationshipActivity, cursor?: TimelineCursor): boolean {
  if (!cursor) return true;
  const difference = activity.at.getTime() - cursor.at.getTime();
  return difference < 0 || (difference === 0 && activity.id.localeCompare(cursor.id) < 0);
}

function outcomeTitle(kind?: string): string {
  const titles: Record<string, string> = {
    follow_up_scheduled: "Follow-up scheduled",
    introduction_made: "Introduction made",
    meeting_held: "Meeting held",
    not_interested: "Not interested",
    opportunity_created: "Opportunity created",
    other: "Relationship outcome recorded",
    reply_received: "Reply received",
  };
  return titles[kind ?? ""] ?? "Relationship outcome recorded";
}

function parseTimelineCursor(value?: string): TimelineCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      at?: unknown;
      id?: unknown;
    };
    const at = new Date(typeof parsed.at === "string" ? parsed.at : "");
    if (Number.isNaN(at.getTime()) || typeof parsed.id !== "string" || !parsed.id) {
      throw new Error("Invalid cursor");
    }
    return { at, id: parsed.id };
  } catch {
    throw new BadRequestException("Timeline cursor is invalid");
  }
}

function parseTimelineLimit(value?: string): number {
  if (!value) return 20;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new BadRequestException("Timeline limit must be an integer between 1 and 50");
  }
  return limit;
}

function parseTimelineTypes(value?: string): Set<RelationshipActivityType> {
  if (!value) return new Set(relationshipActivityTypes);
  const requested = value.split(",").filter(Boolean);
  if (
    requested.length === 0 ||
    requested.some((type) => !relationshipActivityTypes.includes(type as RelationshipActivityType))
  ) {
    throw new BadRequestException("Timeline types contain an unsupported activity type");
  }
  return new Set(requested as RelationshipActivityType[]);
}

function policyTitle(decision?: string): string {
  if (decision === "allowed") return "Policy check allowed";
  if (decision === "blocked") return "Policy check blocked";
  return "Policy review required";
}

function readString(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function toObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function inferSourceType(url: string): EvidenceSourceType {
  const parsed = new URL(url);
  if (parsed.hostname === "github.com") {
    return "github";
  }

  return "user_url";
}

function deriveSubjectName(sourceIdentifier: string): string {
  try {
    return new URL(sourceIdentifier).hostname;
  } catch {
    return sourceIdentifier.slice(0, 120);
  }
}

function toJson(value: EvidenceIngestionJobPayload): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
