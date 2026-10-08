import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Prisma, PrismaClient } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import {
  QueueName,
  type BriefGenerationJobPayload,
  type DraftGenerationJobPayload,
} from "@relationship/queue";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type { CreateDraftMessageDto, CreateRelationshipBriefDto } from "./dto";

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
export class RelationshipBriefsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    input: CreateRelationshipBriefDto,
    idempotencyKey?: string,
  ) {
    this.assertCanReadWorkspace(principal, input.workspaceId);
    const entity = await this.prisma.entity.findFirst({
      where: {
        deletedAt: null,
        id: input.subjectEntityId,
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
    });

    if (!entity) {
      throw new NotFoundException("Subject entity was not found in this workspace");
    }

    const evidence = await this.prisma.evidenceItem.findMany({
      select: { id: true },
      take: 1,
      where: {
        entityId: entity.id,
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
    });

    if (evidence.length === 0) {
      throw new BadRequestException("Relationship brief generation requires evidence");
    }

    const stableIdempotencyKey = resolveIdempotencyKey(idempotencyKey, "brief");
    const payload: BriefGenerationJobPayload = {
      goal: input.goal,
      requestedByUserId: principal.userId,
      subjectEntityId: entity.id,
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    };
    const job = await this.prisma.backgroundJob.upsert({
      create: {
        idempotencyKey: stableIdempotencyKey,
        jobName: "relationship_brief.generate",
        payload: payload as unknown as Prisma.InputJsonValue,
        progress: { percent: 0, stage: "queued" },
        queueName: QueueName.BriefGeneration,
        status: "queued",
        tenantId: principal.tenantId,
        workspaceId: input.workspaceId,
      },
      select: backgroundJobStatusSelect,
      update: {},
      where: {
        tenantId_queueName_idempotencyKey: {
          idempotencyKey: stableIdempotencyKey,
          queueName: QueueName.BriefGeneration,
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
      },
      subjectId: job.id,
      subjectType: "background_job",
      tenantId: principal.tenantId,
      workspaceId: input.workspaceId,
    });
    return job;
  }

  async get(principal: AuthenticatedPrincipal, briefId: string) {
    const brief = await this.prisma.relationshipBrief.findFirst({
      include: {
        draftMessages: true,
        subjectEntity: true,
      },
      where: {
        id: briefId,
        tenantId: principal.tenantId,
      },
    });

    if (!brief) {
      throw new NotFoundException("Relationship brief was not found");
    }

    this.assertCanReadWorkspace(principal, brief.workspaceId);
    return brief;
  }

  async createDraft(
    principal: AuthenticatedPrincipal,
    briefId: string,
    input: CreateDraftMessageDto,
    idempotencyKey?: string,
  ) {
    const brief = await this.get(principal, briefId);
    const variant = input.variant ?? "warm_professional";
    const stableIdempotencyKey = resolveIdempotencyKey(idempotencyKey, "draft");
    const payload: DraftGenerationJobPayload = {
      briefId: brief.id,
      requestedByUserId: principal.userId,
      tenantId: principal.tenantId,
      variant,
      workspaceId: brief.workspaceId,
    };
    const job = await this.prisma.backgroundJob.upsert({
      create: {
        idempotencyKey: stableIdempotencyKey,
        jobName: "draft_message.generate",
        payload: payload as unknown as Prisma.InputJsonValue,
        progress: { percent: 0, stage: "queued" },
        queueName: QueueName.DraftGeneration,
        status: "queued",
        tenantId: principal.tenantId,
        workspaceId: brief.workspaceId,
      },
      select: backgroundJobStatusSelect,
      update: {},
      where: {
        tenantId_queueName_idempotencyKey: {
          idempotencyKey: stableIdempotencyKey,
          queueName: QueueName.DraftGeneration,
          tenantId: principal.tenantId,
        },
      },
    });
    await this.auditService.record({
      actorUserId: principal.userId,
      eventType: "background_job.queued",
      metadata: {
        briefId: brief.id,
        idempotencyKey: stableIdempotencyKey,
        jobName: job.jobName,
        variant,
      },
      subjectId: job.id,
      subjectType: "background_job",
      tenantId: principal.tenantId,
      workspaceId: brief.workspaceId,
    });
    return job;
  }

  private assertCanReadWorkspace(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "workspace:read")) {
      throw new ForbiddenException("You do not have access to this workspace");
    }
  }
}

function resolveIdempotencyKey(value: string | undefined, prefix: string): string {
  const key = value?.trim() || `${prefix}:${crypto.randomUUID()}`;
  if (key.length < 8 || key.length > 200) {
    throw new BadRequestException("Idempotency-Key must be between 8 and 200 characters");
  }
  return key;
}
