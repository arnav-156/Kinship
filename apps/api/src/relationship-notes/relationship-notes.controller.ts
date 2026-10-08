import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateRelationshipNoteDto, UpdateRelationshipNoteDto } from "./dto";
import { RelationshipNotesService } from "./relationship-notes.service";

@Controller("workspaces/:workspaceId/entities/:entityId/notes")
@UseGuards(JwtAuthGuard)
export class RelationshipNotesController {
  constructor(private readonly relationshipNotesService: RelationshipNotesService) {}

  @Get()
  list(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("entityId") entityId: string,
  ) {
    return this.relationshipNotesService.list(principal, workspaceId, entityId);
  }

  @Post()
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("entityId") entityId: string,
    @Body() input: CreateRelationshipNoteDto,
  ) {
    return this.relationshipNotesService.create(principal, workspaceId, entityId, input);
  }

  @Patch(":noteId")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("entityId") entityId: string,
    @Param("noteId") noteId: string,
    @Body() input: UpdateRelationshipNoteDto,
  ) {
    return this.relationshipNotesService.update(principal, workspaceId, entityId, noteId, input);
  }

  @Delete(":noteId")
  remove(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("entityId") entityId: string,
    @Param("noteId") noteId: string,
  ) {
    return this.relationshipNotesService.remove(principal, workspaceId, entityId, noteId);
  }
}
