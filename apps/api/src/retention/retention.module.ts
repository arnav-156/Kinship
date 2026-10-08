import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { RetentionController } from "./retention.controller";
import { RetentionService } from "./retention.service";

@Module({
  controllers: [RetentionController],
  imports: [AuditModule],
  providers: [RetentionService],
})
export class RetentionModule {}
