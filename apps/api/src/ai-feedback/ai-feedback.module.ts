import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AiFeedbackController } from "./ai-feedback.controller";
import { AiFeedbackService } from "./ai-feedback.service";

@Module({
  controllers: [AiFeedbackController],
  imports: [AuditModule],
  providers: [AiFeedbackService],
})
export class AiFeedbackModule {}
