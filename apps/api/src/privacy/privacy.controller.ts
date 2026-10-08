import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";
import type { Response } from "express";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeleteAccountDto } from "./dto";
import { PrivacyService } from "./privacy.service";

@UseGuards(JwtAuthGuard)
@Controller("users/me")
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Get("data-requests")
  listRequests(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.privacyService.listRequests(principal);
  }

  @Post("data-exports")
  requestExport(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.privacyService.requestExport(principal);
  }

  @Get("data-exports/:requestId")
  exportStatus(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("requestId") requestId: string,
  ) {
    return this.privacyService.exportStatus(principal, requestId);
  }

  @Get("data-exports/:requestId/download")
  async downloadExport(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("requestId") requestId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.privacyService.downloadExport(principal, requestId);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="kinship-data-export-${requestId}.json"`,
    );
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    return result;
  }

  @Post("deletion")
  requestDeletion(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Body() input: DeleteAccountDto,
  ) {
    return this.privacyService.requestDeletion(principal, input);
  }
}
