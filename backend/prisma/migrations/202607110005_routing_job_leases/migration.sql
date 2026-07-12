ALTER TABLE "routing_jobs"
  ADD COLUMN "claimed_at" TIMESTAMPTZ(3),
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "lease_owner" TEXT;

-- Existing claimed jobs have no renewable lease and must be reclaimable after deploy.
UPDATE "routing_jobs"
SET
  "claimed_at" = "updated_at",
  "lease_expires_at" = "updated_at"
WHERE "status" = 'claimed';

CREATE INDEX "routing_jobs_queue_status_lease_expires_idx"
  ON "routing_jobs" ("queue", "status", "lease_expires_at");
