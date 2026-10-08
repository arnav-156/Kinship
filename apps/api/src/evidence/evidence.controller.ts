import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AnalyzeUrlDto, IngestEvidenceDto, RecordRelationshipOutcomeDto } from "./dto";
import { EvidenceService } from "./evidence.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Post("analyze-url")
  analyzeUrl(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: AnalyzeUrlDto) {
    return this.evidenceService.analyzeUrl(principal, input);
  }

  @Post("evidence/ingest")
  ingest(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: IngestEvidenceDto) {
    return this.evidenceService.ingest(principal, input);
  }

  @Post("evidence/jobs")
  queueIngestion(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: IngestEvidenceDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.evidenceService.queueIngestion(principal, input, idempotencyKey);
  }

  @Get("evidence/jobs")
  listWorkspaceJobs(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query("workspaceId") workspaceId: string,
  ) {
    return this.evidenceService.listWorkspaceJobs(principal, workspaceId);
  }

  @Get("evidence/jobs/:jobId")
  getWorkspaceJob(@CurrentUser() principal: AuthenticatedPrincipal, @Param("jobId") jobId: string) {
    return this.evidenceService.getWorkspaceJob(principal, jobId);
  }

  @Post("evidence/jobs/:jobId/retry")
  retryWorkspaceJob(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("jobId") jobId: string,
  ) {
    return this.evidenceService.retryWorkspaceJob(principal, jobId);
  }

  @Post("evidence/jobs/:jobId/cancel")
  cancelWorkspaceJob(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("jobId") jobId: string,
  ) {
    return this.evidenceService.cancelWorkspaceJob(principal, jobId);
  }
  @Get("entities/:id/evidence")
  listEntityEvidence(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") entityId: string,
  ) {
    return this.evidenceService.listEntityEvidence(principal, entityId);
  }

  @Get("entities/:id/relationship-timeline")
  relationshipTimeline(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") entityId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
    @Query("types") types?: string,
  ) {
    return this.evidenceService.relationshipTimeline(principal, entityId, {
      cursor,
      limit,
      types,
    });
  }

  @Post("entities/:id/relationship-outcomes")
  recordRelationshipOutcome(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") entityId: string,
    @Body() input: RecordRelationshipOutcomeDto,
  ) {
    return this.evidenceService.recordRelationshipOutcome(principal, entityId, input);
  }
}
