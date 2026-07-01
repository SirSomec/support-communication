ALTER TABLE "billing_quota_reservations"
  ADD COLUMN "locked_at" TIMESTAMPTZ(3);

CREATE INDEX "billing_quota_res_status_expires_locked_idx" ON "billing_quota_reservations"("status", "expires_at", "locked_at");
