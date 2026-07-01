ALTER TABLE "billing_provider_sync_events"
ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
