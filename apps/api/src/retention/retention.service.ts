import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import { Prisma, type PrismaClient, type RetentionPolicy } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import { QueueName } from "@relationship/queue";
import { type ObjectStoragePort, verifiedSnapshotObjectKeys } from "@relationship/storage";
import { randomUUID } from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import { OBJECT_STORAGE } from "../storage/object-storage.token";
import type { UpdateRetentionPolicyDto } from "./dto";

export const DEFAULT_RETENTION_DAYS = 365;
export const RETENTION_DATA_CLASS = "evidence";

const retentionJobSelect = {
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
export class RetentionService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
    @Inject(OBJECT_STORAGE) private readonly objectStorage?: ObjectStoragePort,
  ) {}

  async summary(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    const policy = await this.ensurePolicy(principal.tenantId, workspaceId);
    const [preview, lastRun] = await Promise.all([
      this.previewPolicy(principal.tenantId, workspaceId),
      this.prisma.backgroundJob.findFirst({
        orderBy: { updatedAt: "desc" },
        select: retentionJobSelect,
        where: {
          jobName: "retention.cleanup",
          tenantId: principal.tenantId,
          workspaceId,
        },
      }),
    ]);

    return { lastRun, policies: [policy], preview };
  }

  async updatePolicy(
    principal: AuthenticatedPrincipal,
    workspaceId: string,
    dataClass: string,
    input: UpdateRetentionPolicyDto,
  ) {
    this.assertCanManage(principal, workspaceId);
    this.assertDataClass(dataClass);
    const policy = await this.prisma.retentionPolicy.upsert({
      create: {
        dataClass: RETENTION_DATA_CLASS,
        enabled: input.enabled,
        retentionDays: input.retentionDays,
        tenantId: principal.tenantId,
        workspaceId,
      },
      update: {
        enabled: input.enabled,
        retentionDays: input.retentionDays,
      },
      where: {
        tenantId_workspaceId_dataClass: {
          dataClass: RETENTION_DATA_CLASS,
          tenantId: principal.tenantId,
          workspaceId,
        },
      },
    });

    await this.applyExpirationSchedule(policy);
    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "retention.policy.updated",
      metadata: {
        dataClass: policy.dataClass,
        enabled: policy.enabled,
        retentionDays: policy.retentionDays,
      },
      subjectId: policy.id,
      subjectType: "retention_policy",
      tenantId: principal.tenantId,
      workspaceId,
    });

    return this.summary(principal, workspaceId);
  }

  async preview(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    await this.ensurePolicy(principal.tenantId, workspaceId);
    return this.previewPolicy(principal.tenantId, workspaceId);
  }

  async execute(principal: AuthenticatedPrincipal, workspaceId: string) {
    this.assertCanManage(principal, workspaceId);
    await this.ensurePolicy(principal.tenantId, workspaceId);
    return this.executeCleanup(principal.tenantId, workspaceId, "manual", principal.userId);
  }

  private async ensurePolicy(tenantId: string, workspaceId: string): Promise<RetentionPolicy> {
    const existing = await this.prisma.retentionPolicy.findUnique({
      where: {
        tenantId_workspaceId_dataClass: {
          dataClass: RETENTION_DATA_CLASS,
          tenantId,
          workspaceId,
        },
      },
    });
    if (existing) return existing;

    const policy = await this.prisma.retentionPolicy.create({
      data: {
        dataClass: RETENTION_DATA_CLASS,
        retentionDays: DEFAULT_RETENTION_DAYS,
        tenantId,
        workspaceId,
      },
    });
    await this.applyExpirationSchedule(policy);
    return policy;
  }

  private async applyExpirationSchedule(policy: RetentionPolicy): Promise<void> {
    const evidenceSchedule = policy.enabled
      ? Prisma.sql`"retrieval_timestamp" + (${policy.retentionDays} * INTERVAL '1 day')`
      : Prisma.sql`NULL`;
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "evidence_items"
        SET "retention_expires_at" = ${evidenceSchedule}
        WHERE "tenant_id" = ${policy.tenantId}
          AND "workspace_id" = ${policy.workspaceId}`,
    );
    await this.prisma.$executeRaw(
      Prisma.sql`UPDATE "source_snapshots"
        SET "retention_expires_at" = ${evidenceSchedule}
        WHERE "tenant_id" = ${policy.tenantId}
          AND "workspace_id" = ${policy.workspaceId}`,
    );
  }

  private async previewPolicy(tenantId: string, workspaceId: string) {
    const now = new Date();
    const [dueEvidenceItems, dueSourceSnapshots, nextEvidence, nextSnapshot] = await Promise.all([
      this.prisma.evidenceItem.count({
        where: { retentionExpiresAt: { lte: now }, tenantId, workspaceId },
      }),
      this.prisma.sourceSnapshot.count({
        where: { retentionExpiresAt: { lte: now }, tenantId, workspaceId },
      }),
      this.prisma.evidenceItem.findFirst({
        orderBy: { retentionExpiresAt: "asc" },
        select: { retentionExpiresAt: true },
        where: { retentionExpiresAt: { gt: now }, tenantId, workspaceId },
      }),
      this.prisma.sourceSnapshot.findFirst({
        orderBy: { retentionExpiresAt: "asc" },
        select: { retentionExpiresAt: true },
        where: { retentionExpiresAt: { gt: now }, tenantId, workspaceId },
      }),
    ]);
    const nextExpirationAt = earliestDate(
      nextEvidence?.retentionExpiresAt,
      nextSnapshot?.retentionExpiresAt,
    );

    return {
      dataClass: RETENTION_DATA_CLASS,
      dueEvidenceItems,
      dueSourceSnapshots,
      nextExpirationAt,
      totalDue: dueEvidenceItems + dueSourceSnapshots,
    };
  }

  private async executeCleanup(
    tenantId: string,
    workspaceId: string,
    trigger: "manual" | "scheduled",
    actorUserId?: string,
  ) {
    const job = await this.prisma.backgroundJob.create({
      data: {
        attempts: 1,
        idempotencyKey: `${workspaceId}:${Date.now()}:${randomUUID()}`,
        jobName: "retention.cleanup",
        payload: { dataClass: RETENTION_DATA_CLASS, trigger },
        progress: { percent: 10, stage: "deleting_expired_evidence" },
        queueName: QueueName.RetentionCleanup,
        status: "active",
        tenantId,
        workspaceId,
      },
    });

    try {
      const deleted = await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const evidence = await tx.evidenceItem.deleteMany({
          where: { retentionExpiresAt: { lte: now }, tenantId, workspaceId },
        });
        if (this.objectStorage) {
          const dueSnapshots = await tx.sourceSnapshot.findMany({
            select: { rawContentHash: true, storageKey: true },
            where: {
              evidenceItems: { none: {} },
              retentionExpiresAt: { lte: now },
              tenantId,
              workspaceId,
            },
          });
          const storageKeys = verifiedSnapshotObjectKeys(dueSnapshots, { tenantId, workspaceId });
          for (const key of storageKeys) await this.objectStorage.deleteObject(key);
        }
        const snapshots = await tx.sourceSnapshot.deleteMany({
          where: {
            evidenceItems: { none: {} },
            retentionExpiresAt: { lte: now },
            tenantId,
            workspaceId,
          },
        });
        return {
          evidenceItems: evidence.count,
          sourceSnapshots: snapshots.count,
          total: evidence.count + snapshots.count,
        };
      });
      const completed = await this.prisma.backgroundJob.update({
        data: {
          failureReason: null,
          progress: { deleted, percent: 100, stage: "completed", trigger },
          status: "completed",
        },
        select: retentionJobSelect,
        where: { id: job.id },
      });
      await this.auditService.record({
        actorUserId,
        eventType: "retention.cleanup.completed",
        metadata: { deleted, trigger },
        subjectId: job.id,
        subjectType: "background_job",
        tenantId,
        workspaceId,
      });
      return completed;
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : "Retention cleanup failed";
      await this.prisma.backgroundJob.update({
        data: {
          failureReason,
          progress: { percent: 100, stage: "failed", trigger },
          status: "failed",
        },
        where: { id: job.id },
      });
      await this.auditService.record({
        actorUserId,
        eventType: "retention.cleanup.failed",
        metadata: { failureReason, trigger },
        subjectId: job.id,
        subjectType: "background_job",
        tenantId,
        workspaceId,
      });
      throw error;
    }
  }

  private assertCanManage(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "retention:manage")) {
      throw new ForbiddenException("Retention management requires owner or admin access");
    }
  }

  private assertDataClass(dataClass: string): void {
    if (dataClass !== RETENTION_DATA_CLASS) {
      throw new BadRequestException(`Unsupported retention data class: ${dataClass}`);
    }
  }
}

function earliestDate(...values: Array<Date | null | undefined>): Date | null {
  const dates = values.filter((value): value is Date => value instanceof Date);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((value) => value.getTime())));
}
