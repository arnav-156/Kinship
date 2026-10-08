import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ProspectListsController } from "./prospect-lists.controller";
import { ProspectListsService } from "./prospect-lists.service";

@Module({
  controllers: [ProspectListsController],
  imports: [AuditModule],
  providers: [ProspectListsService],
})
export class ProspectListsModule {}
