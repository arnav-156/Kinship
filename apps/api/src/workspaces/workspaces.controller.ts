import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "./dto";
import { WorkspacesService } from "./workspaces.service";

@Controller("workspaces")
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  create(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: CreateWorkspaceDto) {
    return this.workspacesService.create(principal, input);
  }

  @Get()
  list(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.workspacesService.list(principal);
  }

  @Get(":id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id") workspaceId: string) {
    return this.workspacesService.get(principal, workspaceId);
  }

  @Patch(":id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") workspaceId: string,
    @Body() input: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(principal, workspaceId, input);
  }
}
