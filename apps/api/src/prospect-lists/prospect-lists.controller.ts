import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  CreateProspectListDto,
  CreateProspectListMemberDto,
  ImportProspectListDto,
  UpdateProspectListDto,
  UpdateProspectListMemberDto,
} from "./dto";
import { ProspectListsService } from "./prospect-lists.service";

@Controller("workspaces/:workspaceId/prospect-lists")
@UseGuards(JwtAuthGuard)
export class ProspectListsController {
  constructor(private readonly prospectListsService: ProspectListsService) {}

  @Post()
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Body() input: CreateProspectListDto,
  ) {
    return this.prospectListsService.create(principal, workspaceId, input);
  }

  @Get()
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.prospectListsService.list(principal, workspaceId);
  }

  @Get(":listId")
  get(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
  ) {
    return this.prospectListsService.get(principal, workspaceId, listId);
  }

  @Patch(":listId")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
    @Body() input: UpdateProspectListDto,
  ) {
    return this.prospectListsService.update(principal, workspaceId, listId, input);
  }

  @Delete(":listId")
  archive(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
  ) {
    return this.prospectListsService.archive(principal, workspaceId, listId);
  }

  @Post(":listId/import")
  importCsv(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
    @Body() input: ImportProspectListDto,
  ) {
    return this.prospectListsService.importCsv(principal, workspaceId, listId, input);
  }

  @Post(":listId/members")
  addMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
    @Body() input: CreateProspectListMemberDto,
  ) {
    return this.prospectListsService.addMember(principal, workspaceId, listId, input);
  }

  @Patch(":listId/members/:memberId")
  updateMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
    @Param("memberId") memberId: string,
    @Body() input: UpdateProspectListMemberDto,
  ) {
    return this.prospectListsService.updateMember(principal, workspaceId, listId, memberId, input);
  }

  @Delete(":listId/members/:memberId")
  removeMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("listId") listId: string,
    @Param("memberId") memberId: string,
  ) {
    return this.prospectListsService.removeMember(principal, workspaceId, listId, memberId);
  }
}
