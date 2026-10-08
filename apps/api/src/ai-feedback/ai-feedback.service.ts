import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { PrismaClient } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import crypto from "node:crypto";

import { AuditService } from "../audit/audit.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type {
  AiFeedbackRatingInput,
  AiFeedbackTargetTypeInput,
  GetAiFeedbackDto,
  SubmitAiFeedbackDto,
} from "./dto";

const feedbackReasons: Record<AiFeedbackRatingInput, readonly string[]> = {
  helpful: ["accurate", "actionable", "relevant", "well_grounded", "other"],
  not_helpful: ["inaccurate", "irrelevant", "missing_context", "unsupported", "tone", "other"],
};

type FeedbackTarget = {
  aiRunMetadataKey: "briefId" | "draftId";
  id: string;
  outputHash: string;
  snapshotKey: string;
  targetType: AiFeedbackTargetTypeInput;
  updatedAt: Date;
  workspaceId: string;
};

@Injectable()
export class AiFeedbackService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly auditService: AuditService,
  ) {}

  async get(principal: AuthenticatedPrincipal, input: GetAiFeedbackDto) {
    const target = await this.requireTarget(principal, input.targetType, input.targetId);
    this.assertCanSubmit(principal, target.workspaceId);

    const [current, previous] = await Promise.all([
      this.prisma.aiQualityFeedback.findUnique({
        where: {
          submittedById_snapshotKey: {
            snapshotKey: target.snapshotKey,
            submittedById: principal.userId,
          },
        },
      }),
      this.prisma.aiQualityFeedback.findFirst({
        orderBy: { updatedAt: "desc" },
        where: {
          ...(target.targetType === "brief" ? { briefId: target.id } : { draftId: target.id }),
          outputHash: { not: target.outputHash },
          submittedById: principal.userId,
          tenantId: principal.tenantId,
        },
      }),
    ]);

    return {
      current,
      outputHash: target.outputHash,
      stale: !current && Boolean(previous),
    };
  }

  async submit(principal: AuthenticatedPrincipal, input: SubmitAiFeedbackDto) {
    const target = await this.requireTarget(principal, input.targetType, input.targetId);
    this.assertCanSubmit(principal, target.workspaceId);
    this.assertReasonMatchesRating(input.rating, input.reason);
    const comment = input.comment?.trim() || null;
    const aiRun = await this.findCurrentAiRun(principal, target);

    return this.prisma.$transaction(async (tx) => {
      const feedback = await tx.aiQualityFeedback.upsert({
        create: {
          aiRunId: aiRun?.id,
          ...(target.targetType === "brief" ? { briefId: target.id } : { draftId: target.id }),
          comment,
          outputHash: target.outputHash,
          rating: input.rating,
          reason: input.reason,
          snapshotKey: target.snapshotKey,
          submittedById: principal.userId,
          targetType: target.targetType,
          targetUpdatedAt: target.updatedAt,
          tenantId: principal.tenantId,
          workspaceId: target.workspaceId,
        },
        update: {
          aiRunId: aiRun?.id,
          comment,
          rating: input.rating,
          reason: input.reason,
          targetUpdatedAt: target.updatedAt,
        },
        where: {
          submittedById_snapshotKey: {
            snapshotKey: target.snapshotKey,
            submittedById: principal.userId,
          },
        },
      });
      await this.auditService.record(
        {
          actorUserId: principal.userId,
          eventType: "ai_quality_feedback.submitted",
          metadata: {
            aiRunId: aiRun?.id ?? null,
            rating: input.rating,
            reason: input.reason,
            targetType: target.targetType,
          },
          subjectId: feedback.id,
          subjectType: "ai_quality_feedback",
          tenantId: principal.tenantId,
          workspaceId: target.workspaceId,
        },
        tx,
      );

      return { current: feedback, outputHash: target.outputHash, stale: false };
    });
  }

  private async requireTarget(
    principal: AuthenticatedPrincipal,
    targetType: AiFeedbackTargetTypeInput,
    targetId: string,
  ): Promise<FeedbackTarget> {
    if (targetType === "brief") {
      const brief = await this.prisma.relationshipBrief.findFirst({
        where: { id: targetId, tenantId: principal.tenantId },
      });
      if (!brief) throw new NotFoundException("Relationship brief was not found");
      const outputHash = hashJson({
        channelRisk: brief.channelRisk,
        confidenceScore: brief.confidenceScore,
        evidenceCards: brief.evidenceCards,
        fitScore: brief.fitScore,
        freshnessMetadata: brief.freshnessMetadata,
        outreachAngles: brief.outreachAngles,
        recommendedChannel: brief.recommendedChannel,
        relationshipStage: brief.relationshipStage,
        summary: brief.summary,
        warnings: brief.warnings,
      });
      return {
        aiRunMetadataKey: "briefId",
        id: brief.id,
        outputHash,
        snapshotKey: `brief:${brief.id}:${outputHash}`,
        targetType,
        updatedAt: brief.updatedAt,
        workspaceId: brief.workspaceId,
      };
    }

    const draft = await this.prisma.draftMessage.findFirst({
      where: { id: targetId, tenantId: principal.tenantId },
    });
    if (!draft) throw new NotFoundException("Draft message was not found");
    const outputHash = hashJson({
      body: draft.body,
      channelType: draft.channelType,
      evidenceClaims: draft.evidenceClaims,
      tone: draft.tone,
      variant: draft.variant,
    });
    return {
      aiRunMetadataKey: "draftId",
      id: draft.id,
      outputHash,
      snapshotKey: `draft:${draft.id}:${outputHash}`,
      targetType,
      updatedAt: draft.updatedAt,
      workspaceId: draft.workspaceId,
    };
  }

  private findCurrentAiRun(principal: AuthenticatedPrincipal, target: FeedbackTarget) {
    return this.prisma.aiRun.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
      where: {
        createdAt: { gte: target.updatedAt },
        metadata: { path: [target.aiRunMetadataKey], equals: target.id },
        status: "succeeded",
        tenantId: principal.tenantId,
        workspaceId: target.workspaceId,
      },
    });
  }

  private assertCanSubmit(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "ai-feedback:write")) {
      throw new ForbiddenException("You cannot submit AI feedback in this workspace");
    }
  }

  private assertReasonMatchesRating(rating: AiFeedbackRatingInput, reason: string): void {
    if (!feedbackReasons[rating].includes(reason)) {
      throw new BadRequestException(`Reason '${reason}' is not valid for a ${rating} rating`);
    }
  }
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
