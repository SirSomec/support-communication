ALTER TABLE "billing_quota_reservations"
ADD COLUMN "audit_event" JSONB;

ALTER TABLE "billing_quota_reservations"
ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
