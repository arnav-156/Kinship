-- CreateEnum
CREATE TYPE "DataRequestType" AS ENUM ('export', 'deletion');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "user_data_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "request_type" "DataRequestType" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'processing',
    "result" JSONB,
    "failure_reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_data_requests_tenant_id_user_id_request_type_created_at_idx"
ON "user_data_requests"("tenant_id", "user_id", "request_type", "created_at");

-- CreateIndex
CREATE INDEX "user_data_requests_status_expires_at_idx"
ON "user_data_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "user_data_requests"
ADD CONSTRAINT "user_data_requests_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_data_requests"
ADD CONSTRAINT "user_data_requests_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;