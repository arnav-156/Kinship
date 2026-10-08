CREATE TABLE "workspace_invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',
    "token_hash" TEXT NOT NULL,
    "invited_by_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_policy_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "default_purpose" "PolicyPurpose" NOT NULL DEFAULT 'outreach_review',
    "default_consent_status" "ConsentStatus" NOT NULL DEFAULT 'unknown',
    "default_recipient_type" "RecipientType" NOT NULL DEFAULT 'unknown',
    "default_recipient_region" TEXT NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_policy_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_invitations_token_hash_key"
ON "workspace_invitations"("token_hash");

CREATE INDEX "workspace_invitations_scope_email_status_idx"
ON "workspace_invitations"("tenant_id", "workspace_id", "email", "accepted_at", "revoked_at");

CREATE INDEX "workspace_invitations_expires_at_idx"
ON "workspace_invitations"("expires_at");

CREATE UNIQUE INDEX "workspace_policy_settings_workspace_id_key"
ON "workspace_policy_settings"("workspace_id");

CREATE INDEX "workspace_policy_settings_tenant_id_workspace_id_idx"
ON "workspace_policy_settings"("tenant_id", "workspace_id");

ALTER TABLE "workspace_invitations"
ADD CONSTRAINT "workspace_invitations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "workspace_invitations"
ADD CONSTRAINT "workspace_invitations_invited_by_id_fkey"
FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_policy_settings"
ADD CONSTRAINT "workspace_policy_settings_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
