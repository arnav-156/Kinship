import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { EvidenceController } from "./evidence.controller";
import { EvidenceService } from "./evidence.service";

@Module({
  controllers: [EvidenceController],
  imports: [AuditModule],
  providers: [EvidenceService],
})
export class EvidenceModule {}
