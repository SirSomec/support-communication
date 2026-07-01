CREATE TABLE "report_idempotency_keys" (
  "key" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "report_idempotency_keys_job_idx" ON "report_idempotency_keys"("job_id");
