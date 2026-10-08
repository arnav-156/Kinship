import type { Prisma, PrismaClient, SourceType } from "@relationship/db";
import { QueueName, type ConnectorSyncJobPayload } from "@relationship/queue";

const MIN_REFRESH_INTERVAL_MINUTES = 5;
const MAX_REFRESH_INTERVAL_MINUTES = 30 * 24 * 60;
const supportedProviders = new Set<string>([
  "company_website",
  "crossref",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
]);

export interface ConnectorRefreshSchedulerOptions {
  intervalMs: number;
  now?: () => Date;
  onError?: (error: unknown) => void;
}

export interface ConnectorRefreshSchedulerRunResult {
  accountsScanned: number;
  accountsSkipped: number;
  jobsQueued: number;
}

interface ConnectorRefreshConfiguration {
  configuredAt: Date;
  entityId?: string;
  intervalMinutes: number;
  sourceIdentifier: string;
  subjectName?: string;
}

export class ConnectorRefreshScheduler {
  private currentRun?: Promise<ConnectorRefreshSchedulerRunResult>;
  private readonly now: () => Date;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: ConnectorRefreshSchedulerOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<ConnectorRefreshSchedulerRunResult> {
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

  runOnce(): Promise<ConnectorRefreshSchedulerRunResult> {
    if (this.currentRun) return this.currentRun;
    const run = this.executeRun();
    this.currentRun = run;
    const clearCurrentRun = () => {
      if (this.currentRun === run) this.currentRun = undefined;
    };
    void run.then(clearCurrentRun, clearCurrentRun);
    return run;
  }

  private async executeRun(): Promise<ConnectorRefreshSchedulerRunResult> {
    const accounts = await this.prisma.connectorAccount.findMany({
      select: {
        createdAt: true,
        id: true,
        metadata: true,
        provider: true,
        tenantId: true,
        workspaceId: true,
      },
      where: { status: "active" },
    });
    const result: ConnectorRefreshSchedulerRunResult = {
      accountsScanned: accounts.length,
      accountsSkipped: 0,
      jobsQueued: 0,
    };

    for (const account of accounts) {
      const configuration = parseRefreshConfiguration(account.metadata);
      if (!configuration || !supportedProviders.has(account.provider)) {
        result.accountsSkipped += 1;
        continue;
      }
      const latestRun = await this.prisma.connectorRun.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, status: true },
        where: {
          connectorAccountId: account.id,
          tenantId: account.tenantId,
          workspaceId: account.workspaceId,
        },
      });
      if (latestRun && (latestRun.status === "queued" || latestRun.status === "running")) {
        result.accountsSkipped += 1;
        continue;
      }
      const refreshBase = latestRun?.createdAt ?? configuration.configuredAt;
      const scheduledFor = new Date(
        refreshBase.getTime() + configuration.intervalMinutes * 60 * 1_000,
      );
      if (scheduledFor.getTime() > this.now().getTime()) {
        result.accountsSkipped += 1;
        continue;
      }

      try {
        await this.enqueue(account, configuration, scheduledFor);
        result.jobsQueued += 1;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        result.accountsSkipped += 1;
      }
    }

    return result;
  }

  private async enqueue(
    account: {
      id: string;
      provider: SourceType;
      tenantId: string;
      workspaceId: string;
    },
    configuration: ConnectorRefreshConfiguration,
    scheduledFor: Date,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.connectorRun.create({
        data: {
          connectorAccountId: account.id,
          metadata: {
            scheduledFor: scheduledFor.toISOString(),
            sourceIdentifier: configuration.sourceIdentifier,
            trigger: "scheduled",
          },
          provider: account.provider,
          status: "queued",
          tenantId: account.tenantId,
          workspaceId: account.workspaceId,
        },
        select: { id: true },
      });
      const payload: ConnectorSyncJobPayload = {
        connectorAccountId: account.id,
        connectorRunId: run.id,
        entityId: configuration.entityId,
        provider: account.provider as ConnectorSyncJobPayload["provider"],
        sourceIdentifier: configuration.sourceIdentifier,
        subjectName: configuration.subjectName,
        tenantId: account.tenantId,
        trigger: "scheduled",
        workspaceId: account.workspaceId,
      };
      const job = await tx.backgroundJob.create({
        data: {
          idempotencyKey: `connector-refresh:${account.id}:${scheduledFor.toISOString()}`,
          jobName: "connector.sync",
          payload: payload as unknown as Prisma.InputJsonValue,
          progress: { connectorRunId: run.id, percent: 0, stage: "queued", trigger: "scheduled" },
          queueName: QueueName.ConnectorSync,
          status: "queued",
          tenantId: account.tenantId,
          workspaceId: account.workspaceId,
        },
        select: { id: true },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: null,
          eventType: "connector_sync.queued",
          metadata: {
            jobId: job.id,
            provider: account.provider,
            runId: run.id,
            scheduledFor: scheduledFor.toISOString(),
            trigger: "scheduled",
          },
          subjectId: run.id,
          subjectType: "connector_run",
          tenantId: account.tenantId,
          workspaceId: account.workspaceId,
        },
      });
    });
  }
}

function parseRefreshConfiguration(
  metadata: Prisma.JsonValue,
): ConnectorRefreshConfiguration | null {
  if (!isRecord(metadata) || !isRecord(metadata.refresh)) return null;
  const refresh = metadata.refresh;
  if (refresh.enabled !== true) return null;
  const intervalMinutes = refresh.intervalMinutes;
  const sourceIdentifier = readOptionalString(refresh.sourceIdentifier);
  const configuredAt = readCanonicalDate(refresh.configuredAt);
  if (
    !Number.isInteger(intervalMinutes) ||
    typeof intervalMinutes !== "number" ||
    intervalMinutes < MIN_REFRESH_INTERVAL_MINUTES ||
    intervalMinutes > MAX_REFRESH_INTERVAL_MINUTES ||
    !sourceIdentifier ||
    !configuredAt
  ) {
    return null;
  }
  return {
    configuredAt,
    entityId: readOptionalString(refresh.entityId),
    intervalMinutes,
    sourceIdentifier,
    subjectName: readOptionalString(refresh.subjectName),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readCanonicalDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString() !== value) return null;
  return new Date(timestamp);
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "P2002";
}
