import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { AuditModule } from "../audit/audit.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { DraftsController } from "./drafts.controller";
import { DraftsService } from "./drafts.service";

@Module({
  controllers: [DraftsController],
  imports: [AiModule, AuditModule, ComplianceModule],
  providers: [DraftsService],
})
export class DraftsModule {}
