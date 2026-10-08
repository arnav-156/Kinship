import type { PrismaClient } from "@relationship/db";
import {
  parseBriefGenerationJobPayload,
  parseConnectorSyncJobPayload,
  parseDraftGenerationJobPayload,
  parseEvidenceIngestionJobPayload,
  parseRetentionCleanupJobPayload,
  QueueName,
} from "@relationship/queue";

export interface DeadLetterTarget {
  operator: string;
  tenantId: string;
}

export interface DeadLetterListOptions {
  limit?: number;
  workspaceId?: string;
}

export class DeadLetterUtility {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(target: DeadLetterTarget, options: DeadLetterListOptions = {}) {
    const limit = options.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new Error("Dead-letter list limit must be an integer from 1 to 200");
    }
    const jobs = await this.prisma.backgroundJob.findMany({
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        attempts: true,
        createdAt: true,
        failureReason: true,
        id: true,
        jobName: true,
        maxAttempts: true,
        payload: true,
        queueName: true,
        updatedAt: true,
        workspaceId: true,
      },
      take: limit,
      where: {
        status: "dead_lettered",
        tenantId: target.tenantId,
        ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      },
    });

    return {
      count: jobs.length,
      generatedAt: this.now().toISOString(),
      items: jobs.map((job) => {
        const eligibility = replayEligibility(job, target.tenantId, job.workspaceId);
        return {
          attempts: job.attempts,
          createdAt: job.createdAt.toISOString(),
          failureReason: job.failureReason,
          id: job.id,
          jobName: job.jobName,
          maxAttempts: job.maxAttempts,
          queueName: job.queueName,
          replayable: eligibility.replayable,
          replayBlockedReason: eligibility.reason,
          updatedAt: job.updatedAt.toISOString(),
          workspaceId: job.workspaceId,
        };
      }),
      limit,
      scope: {
        tenantId: target.tenantId,
        workspaceId: options.workspaceId ?? null,
      },
    };
  }

  async inspect(target: DeadLetterTarget, jobId: string) {
    const job = await this.prisma.backgroundJob.findFirst({
      where: {
        id: jobId,
        status: "dead_lettered",
        tenantId: target.tenantId,
      },
    });
    if (!job) throw new Error("Dead-lettered job was not found in the requested tenant");

    const eligibility = replayEligibility(job, target.tenantId, job.workspaceId);
    return {
      attempts: job.attempts,
      availableAt: job.availableAt.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      confirmation: `REPLAY DEAD LETTER ${job.id}`,
      createdAt: job.createdAt.toISOString(),
      failureReason: job.failureReason,
      generatedAt: this.now().toISOString(),
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      jobName: job.jobName,
      lockedAt: job.lockedAt?.toISOString() ?? null,
      lockedBy: job.lockedBy,
      maxAttempts: job.maxAttempts,
      payload: job.payload,
      progress: job.progress,
      queueName: job.queueName,
      replayable: eligibility.replayable,
      replayBlockedReason: eligibility.reason,
      status: job.status,
      updatedAt: job.updatedAt.toISOString(),
      workspaceId: job.workspaceId,
    };
  }

  async executeReplay(target: DeadLetterTarget, jobId: string, confirmation: string) {
    const inspected = await this.inspect(target, jobId);
    if (!inspected.replayable) {
      throw new Error(inspected.replayBlockedReason ?? "Dead-lettered job cannot be replayed");
    }
    if (confirmation !== inspected.confirmation) {
      throw new Error(`Confirmation must exactly match "${inspected.confirmation}"`);
    }

    const replayedAt = this.now();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.backgroundJob.updateMany({
        data: {
          attempts: 0,
          availableAt: replayedAt,
          completedAt: null,
          failureReason: null,
          lockedAt: null,
          lockedBy: null,
          progress: { percent: 0, stage: "queued" },
          status: "queued",
        },
        where: {
          id: jobId,
          queueName: inspected.queueName,
          status: "dead_lettered",
          tenantId: target.tenantId,
        },
      });
      if (updated.count !== 1) {
        throw new Error("Dead-lettered job changed before replay could be applied");
      }

      const auditEvent = await tx.auditEvent.create({
        data: {
          eventType: "background_job.replay_requested",
          metadata: {
            operator: target.operator,
            previousAttempts: inspected.attempts,
            previousFailureReason: inspected.failureReason,
            previousMaxAttempts: inspected.maxAttempts,
            previousStatus: inspected.status,
            trigger: "administrative",
          },
          subjectId: jobId,
          subjectType: "background_job",
          tenantId: target.tenantId,
          workspaceId: inspected.workspaceId,
        },
        select: { id: true },
      });
      const job = await tx.backgroundJob.findUnique({
        where: { id: jobId },
      });
      if (!job) throw new Error("Replayed job could not be reloaded");

      return {
        auditEventId: auditEvent.id,
        job,
        replayedAt: replayedAt.toISOString(),
      };
    });
  }
}

function replayEligibility(
  job: { jobName: string; payload: unknown; queueName: string },
  tenantId: string,
  workspaceId: string | null,
): {
  reason: string | null;
  replayable: boolean;
} {
  const parser =
    job.queueName === QueueName.EvidenceIngestion && job.jobName === "evidence.ingest"
      ? parseEvidenceIngestionJobPayload
      : job.queueName === QueueName.BriefGeneration && job.jobName === "relationship_brief.generate"
        ? parseBriefGenerationJobPayload
        : job.queueName === QueueName.DraftGeneration && job.jobName === "draft_message.generate"
          ? parseDraftGenerationJobPayload
          : job.queueName === QueueName.ConnectorSync && job.jobName === "connector.sync"
            ? parseConnectorSyncJobPayload
            : job.queueName === QueueName.RetentionCleanup && job.jobName === "retention.cleanup"
              ? parseRetentionCleanupJobPayload
              : undefined;
  if (!parser) {
    return {
      reason:
        "Only evidence ingestion, brief generation, draft generation, connector sync, or scheduled retention cleanup jobs can be replayed",
      replayable: false,
    };
  }
  try {
    const payload = parser(job.payload);
    if (payload.tenantId !== tenantId || payload.workspaceId !== workspaceId) {
      return {
        reason: "Stored job payload scope does not match its background job",
        replayable: false,
      };
    }
    return { reason: null, replayable: true };
  } catch (error) {
    return {
      reason: error instanceof Error ? error.message : "Stored job payload is invalid",
      replayable: false,
    };
  }
}
