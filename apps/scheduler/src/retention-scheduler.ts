import { Prisma, type PrismaClient } from "@relationship/db";
import { QueueName } from "@relationship/queue";

export const RETENTION_DATA_CLASS = "evidence";
export const DEFAULT_RETENTION_DAYS = 365;

export interface RetentionSchedulerOptions {
  intervalMs: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface RetentionSchedulerRunResult {
  jobsQueued: number;
  policiesCreated: number;
  policiesScanned: number;
  workspacesSkipped: number;
}

export class RetentionScheduler {
  private currentRun?: Promise<RetentionSchedulerRunResult>;
  private readonly now: () => Date;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: RetentionSchedulerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<RetentionSchedulerRunResult> {
    const initial = await this.runOnce();
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.runOnce().catch((error: unknown) => this.options.onError?.(error));
      }, this.options.intervalMs);
    }
    return initial;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.currentRun;
  }

  runOnce(): Promise<RetentionSchedulerRunResult> {
    if (this.currentRun) return this.currentRun;
    const run = this.executeRun();
    this.currentRun = run;
    const clearCurrentRun = () => {
      if (this.currentRun === run) this.currentRun = undefined;
    };
    void run.then(clearCurrentRun, clearCurrentRun);
    return run;
  }

  private async executeRun(): Promise<RetentionSchedulerRunResult> {
    const [workspaces, storedPolicies] = await Promise.all([
      this.prisma.workspace.findMany({
        select: { id: true, tenantId: true },
        where: { deletedAt: null },
      }),
      this.prisma.retentionPolicy.findMany({
        select: {
          dataClass: true,
          enabled: true,
          retentionDays: true,
          tenantId: true,
          workspaceId: true,
        },
        where: {
          dataClass: RETENTION_DATA_CLASS,
          workspaceId: { not: null },
        },
      }),
    ]);
    const policies = [...storedPolicies];
    const policyScopes = new Set(
      policies.map((policy) => `${policy.tenantId}:${policy.workspaceId ?? "tenant"}`),
    );
    let policiesCreated = 0;
    for (const workspace of workspaces) {
      const scope = `${workspace.tenantId}:${workspace.id}`;
      if (policyScopes.has(scope)) continue;
      try {
        const policy = await this.createDefaultPolicy(workspace.tenantId, workspace.id);
        policies.push(policy);
        policyScopes.add(scope);
        policiesCreated += 1;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
      }
    }
    const enabledPolicies = policies.filter((policy) => policy.enabled && policy.workspaceId);
    const result: RetentionSchedulerRunResult = {
      jobsQueued: 0,
      policiesCreated,
      policiesScanned: enabledPolicies.length,
      workspacesSkipped: 0,
    };

    for (const policy of enabledPolicies) {
      if (!policy.workspaceId) {
        result.workspacesSkipped += 1;
        continue;
      }
      const cutoffAt = this.now();
      const [dueEvidence, dueSnapshot, inFlight] = await Promise.all([
        this.prisma.evidenceItem.findFirst({
          orderBy: { retentionExpiresAt: "asc" },
          select: { retentionExpiresAt: true },
          where: {
            retentionExpiresAt: { lte: cutoffAt },
            tenantId: policy.tenantId,
            workspaceId: policy.workspaceId,
          },
        }),
        this.prisma.sourceSnapshot.findFirst({
          orderBy: { retentionExpiresAt: "asc" },
          select: { retentionExpiresAt: true },
          where: {
            evidenceItems: { none: {} },
            retentionExpiresAt: { lte: cutoffAt },
            tenantId: policy.tenantId,
            workspaceId: policy.workspaceId,
          },
        }),
        this.prisma.backgroundJob.findFirst({
          select: { id: true },
          where: {
            jobName: "retention.cleanup",
            queueName: QueueName.RetentionCleanup,
            status: { in: ["queued", "active"] },
            tenantId: policy.tenantId,
            workspaceId: policy.workspaceId,
          },
        }),
      ]);
      const earliestDue = earliestDate(
        dueEvidence?.retentionExpiresAt,
        dueSnapshot?.retentionExpiresAt,
      );
      if (!earliestDue || inFlight) {
        result.workspacesSkipped += 1;
        continue;
      }

      const payload = {
        cutoffAt: cutoffAt.toISOString(),
        dataClass: RETENTION_DATA_CLASS,
        tenantId: policy.tenantId,
        trigger: "scheduled",
        workspaceId: policy.workspaceId,
      } as const;
      try {
        await this.prisma.$transaction(async (tx) => {
          const job = await tx.backgroundJob.create({
            data: {
              idempotencyKey: `retention-cleanup:${policy.workspaceId}:${earliestDue.toISOString()}`,
              jobName: "retention.cleanup",
              payload: payload as unknown as Prisma.InputJsonValue,
              progress: { percent: 0, stage: "queued" },
              queueName: QueueName.RetentionCleanup,
              status: "queued",
              tenantId: policy.tenantId,
              workspaceId: policy.workspaceId,
            },
            select: { id: true },
          });
          await tx.auditEvent.create({
            data: {
              eventType: "retention.cleanup.queued",
              metadata: { cutoffAt: payload.cutoffAt, trigger: payload.trigger },
              subjectId: job.id,
              subjectType: "background_job",
              tenantId: policy.tenantId,
              workspaceId: policy.workspaceId,
            },
          });
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        result.workspacesSkipped += 1;
        continue;
      }
      result.jobsQueued += 1;
    }

    return result;
  }

  private createDefaultPolicy(tenantId: string, workspaceId: string) {
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.retentionPolicy.create({
        data: {
          dataClass: RETENTION_DATA_CLASS,
          enabled: true,
          retentionDays: DEFAULT_RETENTION_DAYS,
          tenantId,
          workspaceId,
        },
        select: {
          dataClass: true,
          enabled: true,
          retentionDays: true,
          tenantId: true,
          workspaceId: true,
        },
      });
      const expiration = Prisma.sql`"retrieval_timestamp" + (${DEFAULT_RETENTION_DAYS} * INTERVAL '1 day')`;
      await tx.$executeRaw(
        Prisma.sql`UPDATE "evidence_items"
          SET "retention_expires_at" = ${expiration}
          WHERE "tenant_id" = ${tenantId}
            AND "workspace_id" = ${workspaceId}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "source_snapshots"
          SET "retention_expires_at" = ${expiration}
          WHERE "tenant_id" = ${tenantId}
            AND "workspace_id" = ${workspaceId}`,
      );
      return policy;
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "P2002";
}

function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}
