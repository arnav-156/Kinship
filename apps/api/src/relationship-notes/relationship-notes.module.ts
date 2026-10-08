import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { RelationshipNotesController } from "./relationship-notes.controller";
import { RelationshipNotesService } from "./relationship-notes.service";

@Module({
  controllers: [RelationshipNotesController],
  imports: [AuditModule],
  providers: [RelationshipNotesService],
})
export class RelationshipNotesModule {}
