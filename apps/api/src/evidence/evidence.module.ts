import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { AuditModule } from "../audit/audit.module";
import { EvidenceController } from "./evidence.controller";
import { EvidenceService } from "./evidence.service";

@Module({
  controllers: [EvidenceController],
  imports: [AiModule, AuditModule],
  providers: [EvidenceService],
})
export class EvidenceModule {}
