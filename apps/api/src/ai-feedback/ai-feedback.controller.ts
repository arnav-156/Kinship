import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AiFeedbackService } from "./ai-feedback.service";
import { GetAiFeedbackDto, SubmitAiFeedbackDto } from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("ai-feedback")
export class AiFeedbackController {
  constructor(private readonly aiFeedbackService: AiFeedbackService) {}

  @Get()
  get(@CurrentUser() principal: AuthenticatedPrincipal, @Query() input: GetAiFeedbackDto) {
    return this.aiFeedbackService.get(principal, input);
  }

  @Post()
  submit(@CurrentUser() principal: AuthenticatedPrincipal, @Body() input: SubmitAiFeedbackDto) {
    return this.aiFeedbackService.submit(principal, input);
  }
}
