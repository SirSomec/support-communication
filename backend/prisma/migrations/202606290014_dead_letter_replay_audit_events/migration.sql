ALTER TABLE "outbox_events"
ADD COLUMN "dead_letter_replay_audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "billing_sync_jobs"
ADD COLUMN "dead_letter_replay_audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
