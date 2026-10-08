import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AiFeedbackModule } from "./ai-feedback/ai-feedback.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { DatabaseModule } from "./database/database.module";
import { DraftsModule } from "./drafts/drafts.module";
import { EvidenceModule } from "./evidence/evidence.module";
import { HealthController } from "./health.controller";
import { PrivacyModule } from "./privacy/privacy.module";
import { ProspectListsModule } from "./prospect-lists/prospect-lists.module";
import { RelationshipBriefsModule } from "./relationship-briefs/relationship-briefs.module";
import { RelationshipNotesModule } from "./relationship-notes/relationship-notes.module";
import { RetentionModule } from "./retention/retention.module";
import { SearchModule } from "./search/search.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  controllers: [HealthController],
  imports: [
    DatabaseModule,
    AdminModule,
    AiFeedbackModule,
    DraftsModule,
    AuditModule,
    AuthModule,
    WorkspacesModule,
    PrivacyModule,
    ProspectListsModule,
    RelationshipNotesModule,
    EvidenceModule,
    SearchModule,
    ComplianceModule,
    RelationshipBriefsModule,
    RetentionModule,
  ],
})
export class AppModule {}
