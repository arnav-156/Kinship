import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  RestoreDraftVersionDto,
  RewriteDraftMessageDto,
  UpdateDraftMessageDto,
  ValidateDraftMessageDto,
} from "./dto";
import { DraftsService } from "./drafts.service";

@UseGuards(JwtAuthGuard)
@Controller("drafts")
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get(":id")
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id") draftId: string) {
    return this.draftsService.get(principal, draftId);
  }

  @Patch(":id")
  update(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") draftId: string,
    @Body() input: UpdateDraftMessageDto,
  ) {
    return this.draftsService.update(principal, draftId, input);
  }

  @Post(":id/rewrite")
  rewrite(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") draftId: string,
    @Body() input: RewriteDraftMessageDto,
  ) {
    return this.draftsService.rewrite(principal, draftId, input);
  }

  @Post(":id/validate")
  validate(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") draftId: string,
    @Body() input: ValidateDraftMessageDto,
  ) {
    return this.draftsService.validate(principal, draftId, input);
  }

  @Get(":id/versions")
  listVersions(@CurrentUser() principal: AuthenticatedPrincipal, @Param("id") draftId: string) {
    return this.draftsService.listVersions(principal, draftId);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("id") draftId: string,
    @Param("versionId") versionId: string,
    @Body() input: RestoreDraftVersionDto,
  ) {
    return this.draftsService.restoreVersion(principal, draftId, versionId, input);
  }
}
