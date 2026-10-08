import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "./current-user.decorator";
import { LoginDto, RegisterDto } from "./dto";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() input: RegisterDto) {
    return this.authService.register(input);
  }

  @Post("login")
  login(@Body() input: LoginDto) {
    return this.authService.login(input);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.authService.logout(principal.userId, principal.tenantId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() principal: AuthenticatedPrincipal) {
    return this.authService.me(principal.userId, principal.tenantId);
  }
}
