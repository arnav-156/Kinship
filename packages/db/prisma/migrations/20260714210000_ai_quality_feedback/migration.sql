CREATE TYPE "AiFeedbackTargetType" AS ENUM ('brief', 'draft');
CREATE TYPE "AiFeedbackRating" AS ENUM ('helpful', 'not_helpful');

CREATE TABLE "ai_quality_feedback" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "submitted_by_id" TEXT,
    "target_type" "AiFeedbackTargetType" NOT NULL,
    "brief_id" TEXT,
    "draft_id" TEXT,
    "ai_run_id" TEXT,
    "snapshot_key" TEXT NOT NULL,
    "output_hash" TEXT NOT NULL,
    "target_updated_at" TIMESTAMP(3) NOT NULL,
    "rating" "AiFeedbackRating" NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_quality_feedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_quality_feedback_target_check" CHECK (
      ("target_type" = 'brief' AND "brief_id" IS NOT NULL AND "draft_id" IS NULL) OR
      ("target_type" = 'draft' AND "draft_id" IS NOT NULL AND "brief_id" IS NULL)
    )
);

CREATE UNIQUE INDEX "ai_quality_feedback_submitted_by_id_snapshot_key_key"
ON "ai_quality_feedback"("submitted_by_id", "snapshot_key");

CREATE INDEX "ai_quality_feedback_tenant_id_workspace_id_target_type_created_at_idx"
ON "ai_quality_feedback"("tenant_id", "workspace_id", "target_type", "created_at");

CREATE INDEX "ai_quality_feedback_tenant_id_brief_id_created_at_idx"
ON "ai_quality_feedback"("tenant_id", "brief_id", "created_at");

CREATE INDEX "ai_quality_feedback_tenant_id_draft_id_created_at_idx"
ON "ai_quality_feedback"("tenant_id", "draft_id", "created_at");

CREATE INDEX "ai_quality_feedback_ai_run_id_idx" ON "ai_quality_feedback"("ai_run_id");

ALTER TABLE "ai_quality_feedback"
ADD CONSTRAINT "ai_quality_feedback_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_quality_feedback"
ADD CONSTRAINT "ai_quality_feedback_submitted_by_id_fkey"
FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_quality_feedback"
ADD CONSTRAINT "ai_quality_feedback_brief_id_fkey"
FOREIGN KEY ("brief_id") REFERENCES "relationship_briefs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_quality_feedback"
ADD CONSTRAINT "ai_quality_feedback_draft_id_fkey"
FOREIGN KEY ("draft_id") REFERENCES "draft_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_quality_feedback"
ADD CONSTRAINT "ai_quality_feedback_ai_run_id_fkey"
FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
