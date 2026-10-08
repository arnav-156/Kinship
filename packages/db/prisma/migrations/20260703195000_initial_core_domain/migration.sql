-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- EnableExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer', 'compliance_reviewer');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('person', 'organization', 'other');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('user_url', 'company_website', 'github', 'orcid', 'semantic_scholar', 'crossref', 'csv_import', 'crm_import', 'manual_linkedin_context');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('allowed', 'warn', 'blocked');

-- CreateEnum
CREATE TYPE "RelationshipStage" AS ENUM ('unknown', 'prospect', 'warm', 'active', 'dormant', 'customer', 'partner');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('email', 'linkedin_context', 'phone', 'meeting', 'unknown');

-- CreateEnum
CREATE TYPE "DraftVariant" AS ENUM ('concise', 'warm_professional', 'evidence_heavy');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('draft', 'needs_review', 'validated', 'blocked', 'archived');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('confirmed', 'unknown', 'withdrawn');

-- CreateEnum
CREATE TYPE "ConnectorRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "BackgroundJobStatus" AS ENUM ('queued', 'active', 'completed', 'failed', 'dead_lettered');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "default_region" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "region" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_memberships" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "type" "EntityType" NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "description" TEXT,
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "primary_email" TEXT,
    "primary_email_hash" TEXT,
    "orcid_id" TEXT,
    "github_login" TEXT,
    "linkedin_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website_url" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "confidence_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_aliases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source_type" "SourceType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_source_identifiers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_identifier" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_source_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_url" TEXT,
    "source_identifier" TEXT,
    "raw_content_hash" TEXT NOT NULL,
    "content_type" TEXT,
    "storage_key" TEXT,
    "retrieval_timestamp" TIMESTAMP(3) NOT NULL,
    "policy_status" "PolicyStatus" NOT NULL,
    "retention_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "source_snapshot_id" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_url" TEXT,
    "source_identifier" TEXT,
    "retrieval_timestamp" TIMESTAMP(3) NOT NULL,
    "freshness_score" DOUBLE PRECISION NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "policy_status" "PolicyStatus" NOT NULL,
    "raw_content_hash" TEXT NOT NULL,
    "evidence_summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(1536),
    "search_vector" tsvector,
    "retention_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_lists" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "prospect_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospect_list_members" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "prospect_list_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "relationship_stage" "RelationshipStage" NOT NULL DEFAULT 'unknown',
    "fit_score" DOUBLE PRECISION,
    "confidence_score" DOUBLE PRECISION,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prospect_list_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_briefs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "subject_entity_id" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "relationship_stage" "RelationshipStage" NOT NULL DEFAULT 'unknown',
    "fit_score" DOUBLE PRECISION,
    "confidence_score" DOUBLE PRECISION,
    "recommended_channel" "ChannelType" NOT NULL DEFAULT 'unknown',
    "channel_risk" "PolicyStatus" NOT NULL DEFAULT 'warn',
    "summary" TEXT NOT NULL,
    "evidence_cards" JSONB NOT NULL DEFAULT '[]',
    "outreach_angles" JSONB NOT NULL DEFAULT '[]',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "freshness_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_messages" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "brief_id" TEXT,
    "subject_entity_id" TEXT NOT NULL,
    "variant" "DraftVariant" NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "tone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence_claims" JSONB NOT NULL DEFAULT '[]',
    "validation_result" JSONB NOT NULL DEFAULT '{}',
    "status" "DraftStatus" NOT NULL DEFAULT 'needs_review',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "draft_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_channels" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "channel_type" "ChannelType" NOT NULL,
    "value_hash" TEXT NOT NULL,
    "label" TEXT,
    "consent_status" "ConsentStatus" NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "channel_type" "ChannelType" NOT NULL,
    "value_hash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relationship_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "actor_user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "ip_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "SourceType" NOT NULL,
    "display_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector_account_id" TEXT,
    "provider" "SourceType" NOT NULL,
    "status" "ConnectorRunStatus" NOT NULL DEFAULT 'queued',
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'queued',
    "input_hash" TEXT,
    "output_hash" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER,
    "cost_micros" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_runs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "name" TEXT NOT NULL,
    "status" "AiRunStatus" NOT NULL DEFAULT 'queued',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_eval_results" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "eval_run_id" TEXT NOT NULL,
    "fixture_name" TEXT NOT NULL,
    "metric_name" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "queue_name" TEXT NOT NULL,
    "job_name" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL,
    "failure_reason" TEXT,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "data_class" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_status_idx" ON "users"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "workspaces_tenant_id_deleted_at_idx" ON "workspaces"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_tenant_id_slug_key" ON "workspaces"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "workspace_memberships_tenant_id_workspace_id_role_idx" ON "workspace_memberships"("tenant_id", "workspace_id", "role");

-- CreateIndex
CREATE INDEX "workspace_memberships_tenant_id_user_id_idx" ON "workspace_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_memberships_workspace_id_user_id_key" ON "workspace_memberships"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "entities_tenant_id_workspace_id_type_idx" ON "entities"("tenant_id", "workspace_id", "type");

-- CreateIndex
CREATE INDEX "entities_tenant_id_workspace_id_canonical_name_idx" ON "entities"("tenant_id", "workspace_id", "canonical_name");

-- CreateIndex
CREATE UNIQUE INDEX "people_entity_id_key" ON "people"("entity_id");

-- CreateIndex
CREATE INDEX "people_tenant_id_workspace_id_full_name_idx" ON "people"("tenant_id", "workspace_id", "full_name");

-- CreateIndex
CREATE INDEX "people_tenant_id_primary_email_hash_idx" ON "people"("tenant_id", "primary_email_hash");

-- CreateIndex
CREATE INDEX "people_tenant_id_orcid_id_idx" ON "people"("tenant_id", "orcid_id");

-- CreateIndex
CREATE INDEX "people_tenant_id_github_login_idx" ON "people"("tenant_id", "github_login");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_entity_id_key" ON "organizations"("entity_id");

-- CreateIndex
CREATE INDEX "organizations_tenant_id_workspace_id_name_idx" ON "organizations"("tenant_id", "workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_tenant_id_workspace_id_domain_key" ON "organizations"("tenant_id", "workspace_id", "domain");

-- CreateIndex
CREATE INDEX "affiliations_tenant_id_workspace_id_person_id_idx" ON "affiliations"("tenant_id", "workspace_id", "person_id");

-- CreateIndex
CREATE INDEX "affiliations_tenant_id_workspace_id_organization_id_idx" ON "affiliations"("tenant_id", "workspace_id", "organization_id");

-- CreateIndex
CREATE INDEX "entity_aliases_tenant_id_workspace_id_alias_idx" ON "entity_aliases"("tenant_id", "workspace_id", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "entity_aliases_tenant_id_workspace_id_entity_id_alias_key" ON "entity_aliases"("tenant_id", "workspace_id", "entity_id", "alias");

-- CreateIndex
CREATE INDEX "entity_source_identifiers_tenant_id_workspace_id_entity_id_idx" ON "entity_source_identifiers"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_source_identifiers_tenant_id_workspace_id_source_typ_key" ON "entity_source_identifiers"("tenant_id", "workspace_id", "source_type", "source_identifier");

-- CreateIndex
CREATE INDEX "source_snapshots_tenant_id_workspace_id_source_type_idx" ON "source_snapshots"("tenant_id", "workspace_id", "source_type");

-- CreateIndex
CREATE INDEX "source_snapshots_tenant_id_retention_expires_at_idx" ON "source_snapshots"("tenant_id", "retention_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_snapshots_tenant_id_workspace_id_raw_content_hash_key" ON "source_snapshots"("tenant_id", "workspace_id", "raw_content_hash");

-- CreateIndex
CREATE INDEX "evidence_items_tenant_id_workspace_id_entity_id_idx" ON "evidence_items"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE INDEX "evidence_items_tenant_id_workspace_id_source_type_idx" ON "evidence_items"("tenant_id", "workspace_id", "source_type");

-- CreateIndex
CREATE INDEX "evidence_items_tenant_id_retention_expires_at_idx" ON "evidence_items"("tenant_id", "retention_expires_at");

-- CreateIndex
CREATE INDEX "evidence_items_search_vector_gin_idx" ON "evidence_items" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "evidence_items_embedding_ivfflat_idx" ON "evidence_items" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100) WHERE "embedding" IS NOT NULL;

-- CreateTrigger
CREATE FUNCTION evidence_items_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW."search_vector" := to_tsvector('english', coalesce(NEW."evidence_summary", ''));
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_items_search_vector_trigger
BEFORE INSERT OR UPDATE OF "evidence_summary" ON "evidence_items"
FOR EACH ROW EXECUTE FUNCTION evidence_items_search_vector_update();

-- CreateIndex
CREATE INDEX "prospect_lists_tenant_id_workspace_id_deleted_at_idx" ON "prospect_lists"("tenant_id", "workspace_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "prospect_lists_tenant_id_workspace_id_name_key" ON "prospect_lists"("tenant_id", "workspace_id", "name");

-- CreateIndex
CREATE INDEX "prospect_list_members_tenant_id_workspace_id_entity_id_idx" ON "prospect_list_members"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "prospect_list_members_prospect_list_id_entity_id_key" ON "prospect_list_members"("prospect_list_id", "entity_id");

-- CreateIndex
CREATE INDEX "relationship_briefs_tenant_id_workspace_id_subject_entity_i_idx" ON "relationship_briefs"("tenant_id", "workspace_id", "subject_entity_id");

-- CreateIndex
CREATE INDEX "draft_messages_tenant_id_workspace_id_subject_entity_id_idx" ON "draft_messages"("tenant_id", "workspace_id", "subject_entity_id");

-- CreateIndex
CREATE INDEX "draft_messages_tenant_id_workspace_id_status_idx" ON "draft_messages"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE INDEX "contact_channels_tenant_id_workspace_id_entity_id_idx" ON "contact_channels"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "contact_channels_tenant_id_workspace_id_channel_type_value__key" ON "contact_channels"("tenant_id", "workspace_id", "channel_type", "value_hash");

-- CreateIndex
CREATE INDEX "suppression_entries_tenant_id_workspace_id_deleted_at_idx" ON "suppression_entries"("tenant_id", "workspace_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_entries_tenant_id_workspace_id_channel_type_val_key" ON "suppression_entries"("tenant_id", "workspace_id", "channel_type", "value_hash");

-- CreateIndex
CREATE INDEX "relationship_notes_tenant_id_workspace_id_entity_id_idx" ON "relationship_notes"("tenant_id", "workspace_id", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_workspace_id_created_at_idx" ON "audit_events"("tenant_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_tenant_id_event_type_created_at_idx" ON "audit_events"("tenant_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "connector_accounts_tenant_id_workspace_id_provider_key" ON "connector_accounts"("tenant_id", "workspace_id", "provider");

-- CreateIndex
CREATE INDEX "connector_runs_tenant_id_workspace_id_status_idx" ON "connector_runs"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE INDEX "connector_runs_tenant_id_workspace_id_provider_idx" ON "connector_runs"("tenant_id", "workspace_id", "provider");

-- CreateIndex
CREATE INDEX "ai_runs_tenant_id_workspace_id_purpose_created_at_idx" ON "ai_runs"("tenant_id", "workspace_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "ai_eval_runs_tenant_id_created_at_idx" ON "ai_eval_runs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_eval_results_tenant_id_eval_run_id_idx" ON "ai_eval_results"("tenant_id", "eval_run_id");

-- CreateIndex
CREATE INDEX "background_jobs_tenant_id_workspace_id_status_idx" ON "background_jobs"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "background_jobs_tenant_id_queue_name_idempotency_key_key" ON "background_jobs"("tenant_id", "queue_name", "idempotency_key");

-- CreateIndex
CREATE INDEX "retention_policies_tenant_id_enabled_idx" ON "retention_policies"("tenant_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_tenant_id_workspace_id_data_class_key" ON "retention_policies"("tenant_id", "workspace_id", "data_class");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_source_identifiers" ADD CONSTRAINT "entity_source_identifiers_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_lists" ADD CONSTRAINT "prospect_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_list_members" ADD CONSTRAINT "prospect_list_members_prospect_list_id_fkey" FOREIGN KEY ("prospect_list_id") REFERENCES "prospect_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospect_list_members" ADD CONSTRAINT "prospect_list_members_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_briefs" ADD CONSTRAINT "relationship_briefs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_briefs" ADD CONSTRAINT "relationship_briefs_subject_entity_id_fkey" FOREIGN KEY ("subject_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "relationship_briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_messages" ADD CONSTRAINT "draft_messages_subject_entity_id_fkey" FOREIGN KEY ("subject_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_accounts" ADD CONSTRAINT "connector_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_runs" ADD CONSTRAINT "connector_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connector_runs" ADD CONSTRAINT "connector_runs_connector_account_id_fkey" FOREIGN KEY ("connector_account_id") REFERENCES "connector_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_eval_results" ADD CONSTRAINT "ai_eval_results_eval_run_id_fkey" FOREIGN KEY ("eval_run_id") REFERENCES "ai_eval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_policies" ADD CONSTRAINT "retention_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

