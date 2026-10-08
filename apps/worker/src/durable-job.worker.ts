import type { OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import type { BackgroundJob, PrismaClient } from "@relationship/db";
import { createLogger } from "@relationship/logger";
import type { QueueName } from "@relationship/queue";

export const WORKER_RUNTIME_OPTIONS = Symbol("WORKER_RUNTIME_OPTIONS");

export interface WorkerRuntimeOptions {
  concurrency: number;
  leaseMs: number;
  pollIntervalMs: number;
  workerId: string;
}

export interface DurableJobProcessor {
  process(job: BackgroundJob, workerId: string): Promise<void>;
}

export interface DurableJobWorkerOptions {
  jobLabel: string;
  loggerName: string;
  queueName: QueueName;
}

export class DurableJobWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger;
  private pollTimer?: NodeJS.Timeout;
  private currentPoll?: Promise<void>;

  readonly queueName: QueueName;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly processor: DurableJobProcessor,
    private readonly runtime: WorkerRuntimeOptions,
    private readonly options: DurableJobWorkerOptions,
  ) {
    this.logger = createLogger(options.loggerName);
    this.queueName = options.queueName;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverExpiredLeases();
    await this.poll();

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.runtime.pollIntervalMs);
    this.pollTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.currentPoll;
  }

  async runOnce(): Promise<boolean> {
    const now = new Date();
    const candidate = await this.prisma.backgroundJob.findFirst({
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
      where: {
        availableAt: { lte: now },
        queueName: this.queueName,
        status: "queued",
      },
    });
    if (!candidate) return false;

    const claimed = await this.prisma.backgroundJob.updateMany({
      data: {
        attempts: { increment: 1 },
        failureReason: null,
        lockedAt: now,
        lockedBy: this.runtime.workerId,
        progress: { percent: 5, stage: "starting" },
        status: "active",
      },
      where: {
        availableAt: { lte: now },
        id: candidate.id,
        queueName: this.queueName,
        status: "queued",
      },
    });
    if (claimed.count !== 1) return false;

    const job = await this.prisma.backgroundJob.findUnique({
      where: { id: candidate.id },
    });
    if (!job) return false;

    try {
      await this.processor.process(job, this.runtime.workerId);
    } catch (error) {
      await this.handleFailure(job, error);
    }

    return true;
  }

  async recoverExpiredLeases(): Promise<number> {
    const expiredBefore = new Date(Date.now() - this.runtime.leaseMs);
    const staleJobs = await this.prisma.backgroundJob.findMany({
      where: {
        OR: [{ lockedAt: null }, { lockedAt: { lt: expiredBefore } }],
        queueName: this.queueName,
        status: "active",
      },
    });

    let recovered = 0;
    for (const job of staleJobs) {
      const deadLettered = job.attempts >= job.maxAttempts;
      const availableAt = deadLettered
        ? new Date()
        : new Date(Date.now() + retryDelayMs(job.attempts));
      const updated = await this.prisma.backgroundJob.updateMany({
        data: {
          availableAt,
          failureReason: deadLettered
            ? "Worker lease expired after the final attempt"
            : "Worker lease expired; retry scheduled",
          lockedAt: null,
          lockedBy: null,
          progress: {
            percent: deadLettered ? 100 : 0,
            stage: deadLettered ? "dead_lettered" : "retry_scheduled",
          },
          status: deadLettered ? "dead_lettered" : "queued",
        },
        where: {
          id: job.id,
          lockedAt: job.lockedAt,
          status: "active",
        },
      });
      if (updated.count !== 1) continue;

      await this.afterLeaseRecovery(job, deadLettered);
      recovered += 1;
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: readRequestedBy(job),
          eventType: deadLettered
            ? "background_job.dead_lettered"
            : "background_job.lease_recovered",
          metadata: {
            attempts: job.attempts,
            queueName: this.queueName,
            workerId: job.lockedBy,
          },
          subjectId: job.id,
          subjectType: "background_job",
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
        },
      });
    }

    if (recovered > 0) {
      this.logger.warn(`Recovered expired ${this.options.jobLabel} job leases`, {
        recovered,
      });
    }
    return recovered;
  }

  protected async afterLeaseRecovery(_job: BackgroundJob, _deadLettered: boolean): Promise<void> {}

  private async poll(): Promise<void> {
    if (this.currentPoll) return this.currentPoll;

    const poll = Promise.all(
      Array.from({ length: this.runtime.concurrency }, () => this.runOnce()),
    ).then(() => undefined);
    this.currentPoll = poll;

    try {
      await poll;
    } finally {
      if (this.currentPoll === poll) this.currentPoll = undefined;
    }
  }

  private async handleFailure(job: BackgroundJob, error: unknown): Promise<void> {
    const deadLettered = job.attempts >= job.maxAttempts;
    const failureReason = sanitizeFailure(error, this.options.jobLabel);
    const availableAt = deadLettered
      ? new Date()
      : new Date(Date.now() + retryDelayMs(job.attempts));
    const updated = await this.prisma.backgroundJob.updateMany({
      data: {
        availableAt,
        failureReason,
        lockedAt: null,
        lockedBy: null,
        progress: {
          percent: deadLettered ? 100 : 0,
          retryAt: deadLettered ? null : availableAt.toISOString(),
          stage: deadLettered ? "dead_lettered" : "retry_scheduled",
        },
        status: deadLettered ? "dead_lettered" : "queued",
      },
      where: {
        id: job.id,
        lockedBy: this.runtime.workerId,
        status: "active",
      },
    });
    if (updated.count !== 1) return;

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: readRequestedBy(job),
        eventType: deadLettered ? "background_job.dead_lettered" : "background_job.retry_scheduled",
        metadata: {
          attempts: job.attempts,
          failureReason,
          maxAttempts: job.maxAttempts,
          queueName: this.queueName,
          retryAt: deadLettered ? null : availableAt.toISOString(),
        },
        subjectId: job.id,
        subjectType: "background_job",
        tenantId: job.tenantId,
        workspaceId: job.workspaceId,
      },
    });

    this.logger.warn(
      deadLettered
        ? `${this.options.jobLabel} job dead-lettered`
        : `${this.options.jobLabel} job retry scheduled`,
      {
        attempts: job.attempts,
        failureReason,
        jobId: job.id,
      },
    );
  }
}

export function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

function readRequestedBy(job: Pick<BackgroundJob, "payload">): string | undefined {
  if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
    return undefined;
  }
  const value = (job.payload as Record<string, unknown>).requestedByUserId;
  return typeof value === "string" ? value : undefined;
}

function sanitizeFailure(error: unknown, jobLabel: string): string {
  const message = error instanceof Error ? error.message : `Unknown ${jobLabel} failure`;
  return message.replace(/[\r\n]+/g, " ").slice(0, 500);
}
