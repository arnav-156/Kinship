import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

@Module({
  controllers: [PrivacyController],
  imports: [AuditModule],
  providers: [PrivacyService],
})
export class PrivacyModule {}
