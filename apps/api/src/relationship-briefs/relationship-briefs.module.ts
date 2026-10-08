import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { RelationshipBriefsController } from "./relationship-briefs.controller";
import { RelationshipBriefsService } from "./relationship-briefs.service";

@Module({
  controllers: [RelationshipBriefsController],
  imports: [AuditModule],
  providers: [RelationshipBriefsService],
})
export class RelationshipBriefsModule {}
