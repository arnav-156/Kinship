import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  controllers: [WorkspacesController],
  imports: [AuditModule],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
