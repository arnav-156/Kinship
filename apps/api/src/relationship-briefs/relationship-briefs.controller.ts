import { Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateDraftMessageDto, CreateRelationshipBriefDto } from "./dto";
import { RelationshipBriefsService } from "./relationship-briefs.service";

@UseGuards(JwtAuthGuard)
@Controller("relationship-briefs")
export class RelationshipBriefsController {
  constructor(private readonly relationshipBriefsService: RelationshipBriefsService) {}

  @Post()
  create(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: CreateRelationshipBriefDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.relationshipBriefsService.create(principal, input, idempotencyKey);
  }

  @Get(":id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id") briefId: string) {
    return this.relationshipBriefsService.get(principal, briefId);
  }

  @Post(":id/drafts")
  createDraft(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") briefId: string,
    @Body() input: CreateDraftMessageDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.relationshipBriefsService.createDraft(principal, briefId, input, idempotencyKey);
  }
}
