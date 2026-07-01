ALTER TABLE "outbox_events" ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);
ALTER TABLE "outbox_events" ADD COLUMN "dead_lettered_at" TIMESTAMPTZ(3);

ALTER TABLE "billing_sync_jobs" ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3);
ALTER TABLE "billing_sync_jobs" ADD COLUMN "dead_lettered_at" TIMESTAMPTZ(3);

CREATE INDEX "outbox_events_status_queue_next_attempt_at_idx" ON "outbox_events"("status", "queue", "next_attempt_at");
CREATE INDEX "billing_sync_jobs_status_queue_next_attempt_at_idx" ON "billing_sync_jobs"("status", "queue", "next_attempt_at");
