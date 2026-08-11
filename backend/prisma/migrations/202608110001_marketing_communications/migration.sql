ALTER TABLE "client_profiles" ADD COLUMN "time_zone" TEXT;

CREATE TABLE "marketing_access" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "granted_by" TEXT,
  "granted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_access_tenant_user_key" ON "marketing_access"("tenant_id", "user_id");
CREATE INDEX "marketing_access_tenant_enabled_idx" ON "marketing_access"("tenant_id", "enabled");

CREATE TABLE "marketing_api_keys" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "key_last_four" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "marketing_api_keys_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_api_keys_key_hash_key" ON "marketing_api_keys"("key_hash");
CREATE INDEX "marketing_api_keys_tenant_created_idx" ON "marketing_api_keys"("tenant_id", "created_at");

CREATE TABLE "marketing_settings" (
  "tenant_id" TEXT NOT NULL,
  "module_status" TEXT NOT NULL DEFAULT 'inactive',
  "plan_key" TEXT,
  "included_messages" INTEGER NOT NULL DEFAULT 0,
  "overage_kopeks" INTEGER NOT NULL DEFAULT 0,
  "quiet_hours_start" INTEGER NOT NULL DEFAULT 21,
  "quiet_hours_end" INTEGER NOT NULL DEFAULT 9,
  "consent_text" TEXT NOT NULL DEFAULT '',
  "consent_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_settings_pkey" PRIMARY KEY ("tenant_id")
);

CREATE TABLE "marketing_audiences" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_audiences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_audiences_tenant_status_updated_idx" ON "marketing_audiences"("tenant_id", "status", "updated_at");

CREATE TABLE "marketing_audience_members" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "audience_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "matched_by" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_audience_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_audience_members_tenant_audience_client_key" ON "marketing_audience_members"("tenant_id", "audience_id", "client_id");
CREATE INDEX "marketing_audience_members_tenant_client_idx" ON "marketing_audience_members"("tenant_id", "client_id");

CREATE TABLE "marketing_audience_syncs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "audience_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "secret_hash" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "last_success_at" TIMESTAMPTZ(3),
  "last_attempt_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_audience_syncs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_audience_syncs_secret_hash_key" ON "marketing_audience_syncs"("secret_hash");
CREATE UNIQUE INDEX "marketing_audience_syncs_tenant_audience_key" ON "marketing_audience_syncs"("tenant_id", "audience_id");
CREATE INDEX "marketing_audience_syncs_status_updated_idx" ON "marketing_audience_syncs"("status", "updated_at");

CREATE TABLE "marketing_templates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_templates_tenant_updated_idx" ON "marketing_templates"("tenant_id", "updated_at");

CREATE TABLE "marketing_campaigns" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "audience_id" TEXT,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "strategy" TEXT NOT NULL DEFAULT 'manual',
  "content" JSONB NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3),
  "launched_at" TIMESTAMPTZ(3),
  "paused_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_campaigns_tenant_status_schedule_idx" ON "marketing_campaigns"("tenant_id", "status", "scheduled_at");
CREATE INDEX "marketing_campaigns_tenant_updated_idx" ON "marketing_campaigns"("tenant_id", "updated_at");

CREATE TABLE "marketing_deliveries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "excluded_reason" TEXT,
  "outbound_descriptor_id" TEXT,
  "scheduled_at" TIMESTAMPTZ(3),
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_deliveries_idempotency_key_key" ON "marketing_deliveries"("idempotency_key");
CREATE UNIQUE INDEX "marketing_deliveries_outbound_descriptor_id_key" ON "marketing_deliveries"("outbound_descriptor_id");
CREATE UNIQUE INDEX "marketing_deliveries_tenant_campaign_client_channel_key" ON "marketing_deliveries"("tenant_id", "campaign_id", "client_id", "channel");
CREATE INDEX "marketing_deliveries_tenant_campaign_status_idx" ON "marketing_deliveries"("tenant_id", "campaign_id", "status");

CREATE TABLE "marketing_usage_charges" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "period_start" TIMESTAMPTZ(3) NOT NULL,
  "amount_kopeks" INTEGER NOT NULL DEFAULT 0,
  "included" BOOLEAN NOT NULL DEFAULT false,
  "billing_status" TEXT NOT NULL DEFAULT 'pending',
  "invoice_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_usage_charges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_usage_charges_tenant_campaign_client_channel_key" ON "marketing_usage_charges"("tenant_id", "campaign_id", "client_id", "channel");
CREATE INDEX "marketing_usage_charges_tenant_period_idx" ON "marketing_usage_charges"("tenant_id", "period_start");
CREATE INDEX "marketing_usage_charges_billing_status_created_idx" ON "marketing_usage_charges"("billing_status", "created_at");

CREATE TABLE "marketing_usage_invoices" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "period_start" TIMESTAMPTZ(3) NOT NULL,
  "amount_kopeks" INTEGER NOT NULL,
  "charge_count" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotency_key" TEXT NOT NULL,
  "provider_invoice_id" TEXT,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_usage_invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_usage_invoices_idempotency_key_key" ON "marketing_usage_invoices"("idempotency_key");
CREATE INDEX "marketing_usage_invoices_tenant_period_idx" ON "marketing_usage_invoices"("tenant_id", "period_start");
CREATE INDEX "marketing_usage_invoices_status_updated_idx" ON "marketing_usage_invoices"("status", "updated_at");

CREATE TABLE "marketing_consents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "consent_version" INTEGER NOT NULL,
  "evidence" JSONB,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_consents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marketing_consents_tenant_client_channel_key" ON "marketing_consents"("tenant_id", "client_id", "channel");
CREATE INDEX "marketing_consents_tenant_channel_status_idx" ON "marketing_consents"("tenant_id", "channel", "status");

CREATE TABLE "marketing_audit_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "marketing_audit_events_tenant_created_idx" ON "marketing_audit_events"("tenant_id", "created_at");
CREATE INDEX "marketing_audit_events_tenant_entity_idx" ON "marketing_audit_events"("tenant_id", "entity_type", "entity_id");
ALTER TABLE "client_profiles" ADD COLUMN IF NOT EXISTS "email" TEXT;
CREATE INDEX IF NOT EXISTS "client_profiles_tenant_email_idx" ON "client_profiles"("tenant_id", "email");
ALTER TABLE "client_profiles" ADD COLUMN IF NOT EXISTS "phone_normalized" TEXT;
UPDATE "client_profiles" SET "phone_normalized" = CASE WHEN length(regexp_replace("phone", '[^0-9]', '', 'g')) = 11 AND left(regexp_replace("phone", '[^0-9]', '', 'g'), 1) = '8' THEN '7' || substring(regexp_replace("phone", '[^0-9]', '', 'g') FROM 2) ELSE regexp_replace("phone", '[^0-9]', '', 'g') END WHERE "phone_normalized" IS NULL;
CREATE INDEX IF NOT EXISTS "client_profiles_tenant_phone_normalized_idx" ON "client_profiles"("tenant_id", "phone_normalized");

CREATE TABLE IF NOT EXISTS "marketing_consent_text_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_consent_text_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_consent_text_versions_tenant_version_key" ON "marketing_consent_text_versions"("tenant_id", "version");
CREATE INDEX IF NOT EXISTS "marketing_consent_text_versions_tenant_created_idx" ON "marketing_consent_text_versions"("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "marketing_template_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_template_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_template_versions_template_version_key" ON "marketing_template_versions"("template_id", "version");
CREATE INDEX IF NOT EXISTS "marketing_template_versions_tenant_template_created_idx" ON "marketing_template_versions"("tenant_id", "template_id", "created_at");
INSERT INTO "marketing_template_versions" ("id", "tenant_id", "template_id", "version", "title", "content", "created_by", "created_at")
SELECT 'mkt_template_version_' || "id", "tenant_id", "id", "version", "title", "content", "created_by", "created_at"
FROM "marketing_templates"
ON CONFLICT ("template_id", "version") DO NOTHING;

CREATE TABLE IF NOT EXISTS "marketing_audience_sync_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "sync_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_audience_sync_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "marketing_audience_sync_events_sync_event_key" ON "marketing_audience_sync_events"("sync_id", "event_id");
CREATE INDEX IF NOT EXISTS "marketing_audience_sync_events_tenant_created_idx" ON "marketing_audience_sync_events"("tenant_id", "created_at");
