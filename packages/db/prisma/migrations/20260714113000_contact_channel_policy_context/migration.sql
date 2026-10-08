CREATE TYPE "PolicyPurpose" AS ENUM ('relationship_intelligence', 'outreach_review');
CREATE TYPE "RecipientType" AS ENUM ('professional', 'personal', 'unknown');

ALTER TABLE "contact_channels"
  ADD COLUMN "purpose" "PolicyPurpose" NOT NULL DEFAULT 'outreach_review',
  ADD COLUMN "recipient_type" "RecipientType" NOT NULL DEFAULT 'unknown',
  ADD COLUMN "recipient_region" TEXT NOT NULL DEFAULT 'unknown';