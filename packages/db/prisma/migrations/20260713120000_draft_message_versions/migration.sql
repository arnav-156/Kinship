-- CreateTable
CREATE TABLE "draft_message_versions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "variant" "DraftVariant" NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "tone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence_claims" JSONB NOT NULL DEFAULT '[]',
    "validation_result" JSONB NOT NULL DEFAULT '{}',
    "status" "DraftStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_message_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "draft_message_versions_draft_id_version_key"
    ON "draft_message_versions"("draft_id", "version");
CREATE INDEX "draft_message_versions_tenant_id_workspace_id_draft_id_created_at_idx"
    ON "draft_message_versions"("tenant_id", "workspace_id", "draft_id", "created_at");
CREATE INDEX "draft_message_versions_created_by_id_idx"
    ON "draft_message_versions"("created_by_id");

ALTER TABLE "draft_message_versions"
    ADD CONSTRAINT "draft_message_versions_draft_id_fkey"
    FOREIGN KEY ("draft_id") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "draft_message_versions"
    ADD CONSTRAINT "draft_message_versions_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
