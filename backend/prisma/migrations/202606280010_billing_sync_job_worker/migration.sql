ALTER TABLE "billing_sync_jobs" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "billing_sync_jobs" ADD COLUMN "last_error" TEXT;
ALTER TABLE "billing_sync_jobs" ADD COLUMN "locked_at" TIMESTAMPTZ(3);
ALTER TABLE "billing_sync_jobs" ADD COLUMN "published_at" TIMESTAMPTZ(3);

CREATE INDEX "billing_sync_jobs_status_queue_locked_at_idx" ON "billing_sync_jobs"("status", "queue", "locked_at");
