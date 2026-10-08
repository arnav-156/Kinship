CREATE TABLE "connector_credentials" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "connector_account_id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "key_version" TEXT NOT NULL,
    "token_fingerprint" TEXT NOT NULL,
    "rotated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connector_credentials_connector_account_id_key"
ON "connector_credentials"("connector_account_id");

CREATE INDEX "connector_credentials_tenant_id_workspace_id_idx"
ON "connector_credentials"("tenant_id", "workspace_id");

ALTER TABLE "connector_credentials"
ADD CONSTRAINT "connector_credentials_connector_account_id_fkey"
FOREIGN KEY ("connector_account_id") REFERENCES "connector_accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
