-- Add indexes used by worker queue observability summaries when selecting latest
-- delivery evidence by status-specific timestamps.
CREATE INDEX IF NOT EXISTS "outbox_events_status_queue_dead_lettered_at_idx"
  ON "outbox_events"("status", "queue", "dead_lettered_at");

CREATE INDEX IF NOT EXISTS "outbox_events_status_queue_locked_at_idx"
  ON "outbox_events"("status", "queue", "locked_at");

CREATE INDEX IF NOT EXISTS "outbox_events_status_queue_published_at_idx"
  ON "outbox_events"("status", "queue", "published_at");

CREATE INDEX IF NOT EXISTS "billing_sync_jobs_status_queue_dead_lettered_at_idx"
  ON "billing_sync_jobs"("status", "queue", "dead_lettered_at");

CREATE INDEX IF NOT EXISTS "billing_sync_jobs_status_queue_published_at_idx"
  ON "billing_sync_jobs"("status", "queue", "published_at");
