ALTER TABLE "background_jobs"
ADD COLUMN "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "locked_at" TIMESTAMP(3),
ADD COLUMN "locked_by" TEXT,
ADD COLUMN "completed_at" TIMESTAMP(3);

CREATE INDEX "background_jobs_queue_name_status_available_at_idx"
ON "background_jobs"("queue_name", "status", "available_at");