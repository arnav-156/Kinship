import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from "@nestjs/common";
import {
  DRAFT_PROMPT_VERSION,
  DraftMessageOutputSchema,
  RelationshipBriefOutputSchema,
  generateDraftMessage,
  validateEvidenceCoverage,
  type ModelGateway,
  type RelationshipBriefOutput,
} from "@relationship/ai";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { DraftStatus, Prisma, PrismaClient } from "@relationship/db";
import { canPerformWorkspaceAction } from "@relationship/policy";
import crypto from "node:crypto";

import { MODEL_GATEWAY } from "../ai/ai.module";
import { AuditService } from "../audit/audit.service";
import { ComplianceService } from "../compliance/compliance.service";
import { PRISMA_CLIENT } from "../database/prisma.token";
import type {
  RestoreDraftVersionDto,
  RewriteDraftMessageDto,
  UpdateDraftMessageDto,
  ValidateDraftMessageDto,
} from "./dto";

@Injectable()
export class DraftsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(MODEL_GATEWAY) private readonly modelGateway: ModelGateway,
    private readonly auditService: AuditService,
    private readonly complianceService: ComplianceService,
  ) {}

  async get(principal: AuthenticatedPrincipal, draftId: string) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanRead(principal, draft.workspaceId);
    return draft;
  }

  async listVersions(principal: AuthenticatedPrincipal, draftId: string) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanRead(principal, draft.workspaceId);

    return this.prisma.draftMessageVersion.findMany({
      include: {
        createdBy: {
          select: { displayName: true, email: true, id: true },
        },
      },
      orderBy: { version: "desc" },
      where: {
        draftId,
        tenantId: principal.tenantId,
        workspaceId: draft.workspaceId,
      },
    });
  }

  async update(principal: AuthenticatedPrincipal, draftId: string, input: UpdateDraftMessageDto) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanWrite(principal, draft.workspaceId);
    assertCurrentVersion(draft.updatedAt, input.expectedUpdatedAt);

    if (input.body === undefined && input.tone === undefined && input.status === undefined) {
      throw new BadRequestException("A draft update must change the body, tone, or status");
    }
    if (input.body !== undefined && !input.body.trim()) {
      throw new BadRequestException("Draft body cannot be empty");
    }

    const contentChanged = input.body !== undefined || input.tone !== undefined;
    const data: Prisma.DraftMessageUpdateManyMutationInput = {
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.tone !== undefined ? { tone: input.tone.trim() } : {}),
      ...(contentChanged
        ? {
            status: draft.status === "blocked" ? "blocked" : "needs_review",
            validationResult: invalidateValidation(draft.validationResult) as Prisma.InputJsonValue,
          }
        : {}),
      ...(input.status ? { status: input.status } : {}),
    };

    return this.persistVersionedMutation({
      auditEventType:
        input.status === "archived" ? "draft_message.archived" : "draft_message.updated",
      data,
      draft,
      expectedUpdatedAt: input.expectedUpdatedAt,
      principal,
      reason: input.status === "archived" ? "archived" : (input.reason ?? "manual_save"),
    });
  }

  async rewrite(principal: AuthenticatedPrincipal, draftId: string, input: RewriteDraftMessageDto) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanWrite(principal, draft.workspaceId);
    assertCurrentVersion(draft.updatedAt, input.expectedUpdatedAt);
    if (!draft.brief) {
      throw new BadRequestException("Draft rewrite requires its relationship brief");
    }

    const startedAt = Date.now();
    const structuredBrief = toStructuredBrief(draft.brief);
    const variant = input.variant ?? draft.variant;
    const output = await generateDraftMessage(this.modelGateway, {
      brief: structuredBrief,
      currentBody: draft.body,
      goal: draft.brief.goal,
      rewriteInstruction: input.instruction?.trim(),
      subjectName: draft.subjectEntity.canonicalName,
      variant,
    });
    const compliance = await this.complianceService.evaluateDraftChannel({
      channelType: output.channelType,
      entityId: draft.subjectEntityId,
      tenantId: principal.tenantId,
      workspaceId: draft.workspaceId,
    });
    const validationResult = mergeValidationResult(output.validationResult, compliance);
    const status = compliance.decision === "blocked" ? "blocked" : output.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await this.updateWithConcurrency(tx, draft, input.expectedUpdatedAt, {
        body: output.body,
        channelType: output.channelType,
        evidenceClaims: output.evidenceClaims as Prisma.InputJsonValue,
        status,
        tone: output.tone,
        validationResult: validationResult as Prisma.InputJsonValue,
        variant: output.variant,
      });
      await this.createVersion(tx, principal, updated, "rewritten");
      await tx.aiRun.create({
        data: {
          inputHash: hashJson({ draftId, instruction: input.instruction, variant }),
          latencyMs: Date.now() - startedAt,
          metadata: {
            complianceDecision: compliance.decision,
            draftId,
            promptVersion: DRAFT_PROMPT_VERSION,
          },
          model: "configured",
          outputHash: hashJson(output),
          promptVersion: DRAFT_PROMPT_VERSION,
          provider: "configured",
          purpose: "draft_message.rewrite",
          status: "succeeded",
          tenantId: principal.tenantId,
          workspaceId: draft.workspaceId,
        },
      });
      await this.recordAudit(tx, principal, updated, "draft_message.rewritten", {
        instructionProvided: Boolean(input.instruction?.trim()),
        variant: output.variant,
      });
      return updated;
    });
  }

  async validate(
    principal: AuthenticatedPrincipal,
    draftId: string,
    input: ValidateDraftMessageDto,
  ) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanWrite(principal, draft.workspaceId);
    assertCurrentVersion(draft.updatedAt, input.expectedUpdatedAt);
    if (!draft.brief) {
      throw new BadRequestException("Draft validation requires its relationship brief");
    }

    const claims = DraftMessageOutputSchema.shape.evidenceClaims.parse(draft.evidenceClaims);
    const brief = toStructuredBrief(draft.brief);
    const coverage = validateEvidenceCoverage(claims, brief.evidenceCards);
    const compliance = await this.complianceService.evaluateDraftChannel({
      channelType: draft.channelType,
      entityId: draft.subjectEntityId,
      tenantId: principal.tenantId,
      workspaceId: draft.workspaceId,
    });
    const blockedReasons = [
      ...(brief.channelRisk === "blocked" ? ["Relationship brief channel risk is blocked"] : []),
      ...(compliance.decision === "blocked" ? [compliance.reason] : []),
    ];
    const validationResult = {
      blockedReasons,
      citedEvidenceIds: coverage.citedEvidenceIds,
      compliance,
      manualReviewRequired: true,
      unsupportedClaims: coverage.unsupportedClaims,
      validatedAt: new Date().toISOString(),
      warnings: compliance.warnings,
    };
    const status: DraftStatus =
      blockedReasons.length > 0 || coverage.unsupportedClaims.length > 0 ? "blocked" : "validated";

    return this.persistVersionedMutation({
      auditEventType: "draft_message.validated",
      auditMetadata: {
        complianceDecision: compliance.decision,
        status,
        unsupportedClaimCount: coverage.unsupportedClaims.length,
      },
      data: {
        status,
        validationResult: validationResult as unknown as Prisma.InputJsonValue,
      },
      draft,
      expectedUpdatedAt: input.expectedUpdatedAt,
      principal,
      reason: "validated",
    });
  }

  async restoreVersion(
    principal: AuthenticatedPrincipal,
    draftId: string,
    versionId: string,
    input: RestoreDraftVersionDto,
  ) {
    const draft = await this.requireDraft(principal, draftId);
    this.assertCanWrite(principal, draft.workspaceId);
    assertCurrentVersion(draft.updatedAt, input.expectedUpdatedAt);
    const version = await this.prisma.draftMessageVersion.findFirst({
      where: {
        draftId,
        id: versionId,
        tenantId: principal.tenantId,
        workspaceId: draft.workspaceId,
      },
    });
    if (!version) {
      throw new NotFoundException("Draft version was not found");
    }

    return this.persistVersionedMutation({
      auditEventType: "draft_message.version_restored",
      auditMetadata: { restoredVersion: version.version },
      data: {
        body: version.body,
        channelType: version.channelType,
        evidenceClaims: version.evidenceClaims as Prisma.InputJsonValue,
        status: version.status === "blocked" ? "blocked" : "needs_review",
        tone: version.tone,
        validationResult: {
          ...asRecord(version.validationResult),
          restoredFromVersion: version.version,
          validatedAt: null,
        },
        variant: version.variant,
      },
      draft,
      expectedUpdatedAt: input.expectedUpdatedAt,
      principal,
      reason: `restored_v${version.version}`,
    });
  }

  private async requireDraft(principal: AuthenticatedPrincipal, draftId: string) {
    const draft = await this.prisma.draftMessage.findFirst({
      include: {
        brief: true,
        subjectEntity: true,
      },
      where: { id: draftId, tenantId: principal.tenantId },
    });
    if (!draft) {
      throw new NotFoundException("Draft message was not found");
    }
    return draft;
  }

  private async persistVersionedMutation(input: {
    auditEventType: string;
    auditMetadata?: Record<string, unknown>;
    data: Prisma.DraftMessageUpdateManyMutationInput;
    draft: Awaited<ReturnType<DraftsService["requireDraft"]>>;
    expectedUpdatedAt: string;
    principal: AuthenticatedPrincipal;
    reason: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await this.updateWithConcurrency(
        tx,
        input.draft,
        input.expectedUpdatedAt,
        input.data,
      );
      await this.createVersion(tx, input.principal, updated, input.reason);
      await this.recordAudit(
        tx,
        input.principal,
        updated,
        input.auditEventType,
        input.auditMetadata,
      );
      return updated;
    });
  }

  private async updateWithConcurrency(
    tx: Prisma.TransactionClient,
    draft: Awaited<ReturnType<DraftsService["requireDraft"]>>,
    expectedUpdatedAt: string,
    data: Prisma.DraftMessageUpdateManyMutationInput,
  ) {
    const result = await tx.draftMessage.updateMany({
      data,
      where: {
        id: draft.id,
        tenantId: draft.tenantId,
        updatedAt: new Date(expectedUpdatedAt),
      },
    });
    if (result.count !== 1) {
      throw new PreconditionFailedException(
        "Draft changed since it was loaded. Refresh before applying your changes.",
      );
    }
    return tx.draftMessage.findUniqueOrThrow({ where: { id: draft.id } });
  }

  private async createVersion(
    tx: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    draft: {
      body: string;
      channelType: Prisma.DraftMessageGetPayload<Record<string, never>>["channelType"];
      evidenceClaims: Prisma.JsonValue;
      id: string;
      status: DraftStatus;
      tenantId: string;
      tone: string;
      validationResult: Prisma.JsonValue;
      variant: Prisma.DraftMessageGetPayload<Record<string, never>>["variant"];
      workspaceId: string;
    },
    reason: string,
  ) {
    const latest = await tx.draftMessageVersion.findFirst({
      orderBy: { version: "desc" },
      select: { version: true },
      where: { draftId: draft.id },
    });
    return tx.draftMessageVersion.create({
      data: {
        body: draft.body,
        channelType: draft.channelType,
        createdById: principal.userId,
        draftId: draft.id,
        evidenceClaims: draft.evidenceClaims as Prisma.InputJsonValue,
        reason,
        status: draft.status,
        tenantId: draft.tenantId,
        tone: draft.tone,
        validationResult: draft.validationResult as Prisma.InputJsonValue,
        variant: draft.variant,
        version: (latest?.version ?? 0) + 1,
        workspaceId: draft.workspaceId,
      },
    });
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
    draft: { id: string; workspaceId: string },
    eventType: string,
    metadata: Record<string, unknown> = {},
  ) {
    return this.auditService.record(
      {
        actorUserId: principal.userId,
        eventType,
        metadata: metadata as unknown as Prisma.InputJsonValue,
        subjectId: draft.id,
        subjectType: "draft_message",
        tenantId: principal.tenantId,
        workspaceId: draft.workspaceId,
      },
      tx,
    );
  }

  private assertCanRead(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "draft:read")) {
      throw new ForbiddenException("You do not have access to this draft");
    }
  }

  private assertCanWrite(principal: AuthenticatedPrincipal, workspaceId: string): void {
    const membership = principal.workspaceRoles.find((role) => role.workspaceId === workspaceId);
    if (!membership || !canPerformWorkspaceAction(membership.role, "draft:write")) {
      throw new ForbiddenException("You cannot change drafts in this workspace");
    }
  }
}

function assertCurrentVersion(updatedAt: Date, expectedUpdatedAt: string): void {
  if (updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
    throw new PreconditionFailedException(
      "Draft changed since it was loaded. Refresh before applying your changes.",
    );
  }
}

function invalidateValidation(value: Prisma.JsonValue) {
  return {
    ...asRecord(value),
    manualEdit: true,
    validatedAt: null,
  };
}

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
  compliance: {
    decision: string;
    reason: string;
    reviewRequired: boolean;
    warnings: string[];
  },
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
