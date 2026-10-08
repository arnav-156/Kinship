import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AdminController, WorkspaceInvitationsController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  controllers: [AdminController, WorkspaceInvitationsController],
  imports: [AuditModule],
  providers: [AdminService],
})
export class AdminModule {}
