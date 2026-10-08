import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateSuppressionEntryDto, EvaluateComplianceDto, UpsertContactChannelDto } from "./dto";
import { ComplianceService } from "./compliance.service";

@UseGuards(JwtAuthGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post("contact-channels")
  upsertContactChannel(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: UpsertContactChannelDto,
  ) {
    return this.complianceService.upsertContactChannel(principal, input);
  }

  @Get("contact-channels")
  listContactChannels(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query("workspaceId") workspaceId: string,
    @Query("entityId") entityId: string,
  ) {
    return this.complianceService.listContactChannels(principal, workspaceId, entityId);
  }

  @Post("suppressions")
  createSuppression(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateSuppressionEntryDto,
  ) {
    return this.complianceService.createSuppression(principal, input);
  }

  @Get("suppressions")
  listSuppressions(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.complianceService.listSuppressions(principal, workspaceId);
  }

  @Delete("suppressions/:id")
  deleteSuppression(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") suppressionId: string,
  ) {
    return this.complianceService.deleteSuppression(principal, suppressionId);
  }

  @Post("evaluate")
  evaluate(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: EvaluateComplianceDto) {
    return this.complianceService.evaluate(principal, input);
  }
}
