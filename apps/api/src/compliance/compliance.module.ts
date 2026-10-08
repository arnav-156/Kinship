import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";

@Module({
  controllers: [ComplianceController],
  exports: [ComplianceService],
  imports: [AuditModule],
  providers: [ComplianceService],
})
export class ComplianceModule {}
