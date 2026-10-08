import { Body, Controller, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UpdateRetentionPolicyDto } from "./dto";
import { RetentionService } from "./retention.service";

@UseGuards(JwtAuthGuard)
@Controller("workspaces/:workspaceId/retention")
export class RetentionController {
  constructor(private readonly retentionService: RetentionService) {}

  @Get()
  summary(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.retentionService.summary(principal, workspaceId);
  }

  @Put("policies/:dataClass")
  updatePolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("dataClass") dataClass: string,
    @Body() input: UpdateRetentionPolicyDto,
  ) {
    return this.retentionService.updatePolicy(principal, workspaceId, dataClass, input);
  }

  @Post("preview")
  preview(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.retentionService.preview(principal, workspaceId);
  }

  @Post("execute")
  execute(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.retentionService.execute(principal, workspaceId);
  }
}
