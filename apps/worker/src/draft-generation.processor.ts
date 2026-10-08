import crypto from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  DRAFT_PROMPT_VERSION,
  RelationshipBriefOutputSchema,
  generateDraftMessage,
  type ModelGateway,
  type RelationshipBriefOutput,
} from "@relationship/ai";
import type { BackgroundJob, ChannelType, Prisma, PrismaClient } from "@relationship/db";
import { evaluateCompliancePolicy, type CompliancePolicyResult } from "@relationship/policy";
import { parseDraftGenerationJobPayload } from "@relationship/queue";

import { WORKER_MODEL_GATEWAY } from "./worker-ai.token";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class DraftGenerationProcessor {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(WORKER_MODEL_GATEWAY) private readonly modelGateway: ModelGateway,
  ) {}

  async process(job: BackgroundJob, workerId: string): Promise<void> {
    const payload = parseDraftGenerationJobPayload(job.payload);
    if (payload.tenantId !== job.tenantId || payload.workspaceId !== job.workspaceId) {
      throw new Error("Stored draft payload does not match its job scope");
    }

    const brief = await this.prisma.relationshipBrief.findFirst({
      include: { subjectEntity: true },
      where: {
        id: payload.briefId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });
    if (!brief) throw new Error("Relationship brief was not found in this workspace");

    await this.updateProgress(job.id, workerId, 25, "generating_draft");
    const startedAt = Date.now();
    try {
      const draftOutput = await generateDraftMessage(this.modelGateway, {
        brief: toStructuredBrief(brief),
        goal: brief.goal,
        subjectName: brief.subjectEntity.canonicalName,
        variant: payload.variant,
      });

      await this.updateProgress(job.id, workerId, 60, "checking_compliance");
      const compliance = await this.evaluateDraftChannel({
        channelType: draftOutput.channelType,
        entityId: brief.subjectEntityId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      });
      const validationResult = mergeValidationResult(draftOutput.validationResult, compliance);
      const status = compliance.decision === "blocked" ? "blocked" : draftOutput.status;
      const latencyMs = Date.now() - startedAt;

      await this.updateProgress(job.id, workerId, 80, "saving_draft");
      await this.prisma.$transaction(async (tx) => {
        const draft = await tx.draftMessage.create({
          data: {
            body: draftOutput.body,
            briefId: brief.id,
            channelType: draftOutput.channelType,
            evidenceClaims: draftOutput.evidenceClaims as Prisma.InputJsonValue,
            status,
            subjectEntityId: brief.subjectEntityId,
            tenantId: payload.tenantId,
            tone: draftOutput.tone,
            validationResult: validationResult as unknown as Prisma.InputJsonValue,
            variant: draftOutput.variant,
            workspaceId: payload.workspaceId,
          },
        });
        await tx.draftMessageVersion.create({
          data: {
            body: draft.body,
            channelType: draft.channelType,
            createdById: payload.requestedByUserId,
            draftId: draft.id,
            evidenceClaims: draft.evidenceClaims as Prisma.InputJsonValue,
            reason: "generated",
            status: draft.status,
            tenantId: draft.tenantId,
            tone: draft.tone,
            validationResult: draft.validationResult as Prisma.InputJsonValue,
            variant: draft.variant,
            version: 1,
            workspaceId: draft.workspaceId,
          },
        });
        await tx.aiRun.create({
          data: {
            inputHash: hashJson({ briefId: brief.id, variant: payload.variant }),
            latencyMs,
            metadata: {
              briefId: brief.id,
              complianceDecision: compliance.decision,
              draftId: draft.id,
              jobId: job.id,
              promptVersion: DRAFT_PROMPT_VERSION,
            },
            model: "relationship-gateway",
            outputHash: hashJson(draftOutput),
            promptVersion: DRAFT_PROMPT_VERSION,
            provider: process.env["AI_PROVIDER"] ?? "mock",
            purpose: "draft_message.generate",
            status: "succeeded",
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        });

        const completed = await tx.backgroundJob.updateMany({
          data: {
            completedAt: new Date(),
            failureReason: null,
            lockedAt: null,
            lockedBy: null,
            progress: {
              briefId: brief.id,
              draftId: draft.id,
              percent: 100,
              stage: "completed",
            },
            status: "completed",
          },
          where: { id: job.id, lockedBy: workerId, status: "active" },
        });
        if (completed.count !== 1) {
          throw new Error("Draft generation job lease was lost before completion");
        }

        await tx.auditEvent.create({
          data: {
            actorUserId: payload.requestedByUserId,
            eventType: "draft_message.generated",
            metadata: {
              complianceDecision: compliance.decision,
              jobId: job.id,
              status: draft.status,
              variant: payload.variant,
            },
            subjectId: draft.id,
            subjectType: "draft_message",
            tenantId: payload.tenantId,
            workspaceId: payload.workspaceId,
          },
        });
      });
    } catch (error) {
      await this.prisma.aiRun.create({
        data: {
          latencyMs: Date.now() - startedAt,
          metadata: {
            briefId: brief.id,
            error: error instanceof Error ? error.message : "Unknown AI failure",
            jobId: job.id,
          },
          model: "unknown",
          promptVersion: DRAFT_PROMPT_VERSION,
          provider: process.env["AI_PROVIDER"] ?? "unknown",
          purpose: "draft_message.generate",
          status: "failed",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      throw error;
    }
  }

  private async evaluateDraftChannel(input: {
    channelType: ChannelType;
    entityId: string;
    tenantId: string;
    workspaceId: string;
  }): Promise<CompliancePolicyResult> {
    const channel = await this.prisma.contactChannel.findFirst({
      orderBy: { updatedAt: "desc" },
      where: {
        channelType: input.channelType,
        entityId: input.entityId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
    });
    const suppression = channel
      ? await this.prisma.suppressionEntry.findFirst({
          where: {
            channelType: input.channelType,
            deletedAt: null,
            OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }],
            tenantId: input.tenantId,
            valueHash: channel.valueHash,
          },
        })
      : null;

    return evaluateCompliancePolicy({
      channelType: input.channelType,
      consentStatus: channel?.consentStatus ?? "unknown",
      purpose: channel?.purpose ?? "outreach_review",
      recipientRegion: channel?.recipientRegion ?? "unknown",
      recipientType: channel?.recipientType ?? "unknown",
      sourceType: "user_url",
      suppressionStatus: suppression ? "suppressed" : "clear",
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
    });
  }

  private async updateProgress(
    jobId: string,
    workerId: string,
    percent: number,
    stage: string,
  ): Promise<void> {
    const updated = await this.prisma.backgroundJob.updateMany({
      data: { lockedAt: new Date(), progress: { percent, stage } },
      where: { id: jobId, lockedBy: workerId, status: "active" },
    });
    if (updated.count !== 1) {
      throw new Error("Draft generation job lease was lost during processing");
    }
  }
}

function toStructuredBrief(brief: {
  channelRisk: string;
  confidenceScore: number | null;
  evidenceCards: Prisma.JsonValue;
  fitScore: number | null;
  freshnessMetadata: Prisma.JsonValue;
  outreachAngles: Prisma.JsonValue;
  recommendedChannel: string;
  relationshipStage: string;
  summary: string;
  warnings: Prisma.JsonValue;
}): RelationshipBriefOutput {
  return RelationshipBriefOutputSchema.parse({
    channelRisk: brief.channelRisk,
    confidenceScore: brief.confidenceScore ?? 0,
    evidenceCards: brief.evidenceCards,
    fitScore: brief.fitScore ?? 0,
    freshnessMetadata: brief.freshnessMetadata,
    outreachAngles: brief.outreachAngles,
    recommendedChannel: brief.recommendedChannel,
    relationshipStage: brief.relationshipStage,
    summary: brief.summary,
    warnings: brief.warnings,
  });
}

function mergeValidationResult(
  validationResult: {
    blockedReasons: string[];
    citedEvidenceIds: string[];
    unsupportedClaims: string[];
  },
  compliance: CompliancePolicyResult,
) {
  return {
    ...validationResult,
    blockedReasons:
      compliance.decision === "blocked"
        ? [...validationResult.blockedReasons, compliance.reason]
        : validationResult.blockedReasons,
    compliance,
    warnings: compliance.warnings,
  };
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
