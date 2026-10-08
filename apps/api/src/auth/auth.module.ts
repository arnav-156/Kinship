import { Global, Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

@Global()
@Module({
  controllers: [AuthController],
  exports: [JwtAuthGuard, PasswordService, TokenService],
  imports: [AuditModule],
  providers: [AuthService, JwtAuthGuard, PasswordService, TokenService],
})
export class AuthModule {}
