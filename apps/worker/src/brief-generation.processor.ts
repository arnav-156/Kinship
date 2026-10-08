import crypto from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import {
  PROMPT_VERSION,
  generateRelationshipBrief,
  type EvidenceCard,
  type ModelGateway,
} from "@relationship/ai";
import type { BackgroundJob, Prisma, PrismaClient } from "@relationship/db";
import { parseBriefGenerationJobPayload } from "@relationship/queue";

import { WORKER_MODEL_GATEWAY } from "./worker-ai.token";
import { WORKER_PRISMA_CLIENT } from "./worker-prisma.token";

@Injectable()
export class BriefGenerationProcessor {
  constructor(
    @Inject(WORKER_PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(WORKER_MODEL_GATEWAY) private readonly modelGateway: ModelGateway,
  ) {}

  async process(job: BackgroundJob, workerId: string): Promise<void> {
    const payload = parseBriefGenerationJobPayload(job.payload);
    if (payload.tenantId !== job.tenantId || payload.workspaceId !== job.workspaceId) {
      throw new Error("Stored brief payload does not match its job scope");
    }

    const entity = await this.prisma.entity.findFirst({
      select: { canonicalName: true, id: true },
      where: {
        deletedAt: null,
        id: payload.subjectEntityId,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });
    if (!entity) {
      throw new Error("Subject entity was not found in this workspace");
    }

    const evidence = await this.prisma.evidenceItem.findMany({
      orderBy: { retrievalTimestamp: "desc" },
      take: 12,
      where: {
        entityId: entity.id,
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
      },
    });
    const evidenceCards = evidence.map(toEvidenceCard);
    if (evidenceCards.length === 0) {
      throw new Error("Relationship brief generation requires evidence");
    }

    await this.updateProgress(job.id, workerId, 25, "generating_brief");
    const startedAt = Date.now();
    let output: Awaited<ReturnType<typeof generateRelationshipBrief>>;
    try {
      output = await generateRelationshipBrief(this.modelGateway, {
        evidenceCards,
        goal: payload.goal,
        subjectName: entity.canonicalName,
      });
    } catch (error) {
      await this.prisma.aiRun.create({
        data: {
          latencyMs: Date.now() - startedAt,
          metadata: {
            error: error instanceof Error ? error.message : "Unknown AI failure",
            jobId: job.id,
          },
          model: "unknown",
          promptVersion: PROMPT_VERSION,
          provider: process.env["AI_PROVIDER"] ?? "unknown",
          purpose: "relationship_brief.generate",
          status: "failed",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
      throw error;
    }
    const latencyMs = Date.now() - startedAt;

    await this.updateProgress(job.id, workerId, 80, "saving_brief");
    await this.prisma.$transaction(async (tx) => {
      const brief = await tx.relationshipBrief.create({
        data: {
          channelRisk: output.channelRisk,
          confidenceScore: output.confidenceScore,
          evidenceCards: output.evidenceCards as Prisma.InputJsonValue,
          fitScore: output.fitScore,
          freshnessMetadata: output.freshnessMetadata as Prisma.InputJsonValue,
          goal: payload.goal,
          outreachAngles: output.outreachAngles as Prisma.InputJsonValue,
          recommendedChannel: output.recommendedChannel,
          relationshipStage: output.relationshipStage,
          subjectEntityId: entity.id,
          summary: output.summary,
          tenantId: payload.tenantId,
          warnings: output.warnings as Prisma.InputJsonValue,
          workspaceId: payload.workspaceId,
        },
      });
      await tx.aiRun.create({
        data: {
          inputHash: hashJson({
            evidenceCards,
            goal: payload.goal,
            subjectEntityId: entity.id,
          }),
          latencyMs,
          metadata: {
            briefId: brief.id,
            evidenceItemCount: evidenceCards.length,
            jobId: job.id,
            promptVersion: PROMPT_VERSION,
          },
          model: "relationship-gateway",
          outputHash: hashJson(output),
          promptVersion: PROMPT_VERSION,
          provider: process.env["AI_PROVIDER"] ?? "mock",
          purpose: "relationship_brief.generate",
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
            evidenceItemCount: evidenceCards.length,
            percent: 100,
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
        throw new Error("Brief generation job lease was lost before completion");
      }

      await tx.auditEvent.create({
        data: {
          actorUserId: payload.requestedByUserId,
          eventType: "relationship_brief.generated",
          metadata: {
            evidenceItemCount: evidenceCards.length,
            jobId: job.id,
          },
          subjectId: brief.id,
          subjectType: "relationship_brief",
          tenantId: payload.tenantId,
          workspaceId: payload.workspaceId,
        },
      });
    });
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
      where: { id: jobId, lockedBy: workerId, status: "active" },
    });
    if (updated.count !== 1) {
      throw new Error("Brief generation job lease was lost during processing");
    }
  }
}

function toEvidenceCard(item: {
  confidenceScore: number;
  evidenceSummary: string;
  freshnessScore: number;
  id: string;
  sourceType: string;
}): EvidenceCard {
  return {
    confidenceScore: item.confidenceScore,
    evidenceId: item.id,
    rankScore: roundScore((item.confidenceScore + item.freshnessScore) / 2),
    sourceType: item.sourceType,
    summary: item.evidenceSummary,
  };
}

function hashJson(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}
