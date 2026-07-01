CREATE TABLE "billing_payment_retry_schedules" (
  "tenant_id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_invoice_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "last_attempt_at" TIMESTAMPTZ(3),
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payment_retry_schedules_pkey" PRIMARY KEY ("tenant_id", "schedule_id"),
  CONSTRAINT "billing_payment_retry_schedules_status_check" CHECK ("status" IN ('canceled', 'exhausted', 'paid', 'scheduled')),
  CONSTRAINT "billing_payment_retry_schedules_attempt_check" CHECK ("attempt" >= 0 AND "max_attempts" > 0)
);

CREATE UNIQUE INDEX "billing_payment_retry_schedules_idempotency_key_key" ON "billing_payment_retry_schedules"("idempotency_key");

CREATE INDEX "billing_retry_sched_tenant_invoice_status_next_idx" ON "billing_payment_retry_schedules"("tenant_id", "invoice_id", "status", "next_attempt_at");

CREATE INDEX "billing_retry_sched_tenant_status_next_idx" ON "billing_payment_retry_schedules"("tenant_id", "status", "next_attempt_at");

CREATE INDEX "billing_retry_sched_provider_invoice_idx" ON "billing_payment_retry_schedules"("provider", "provider_invoice_id");

ALTER TABLE "billing_payment_retry_schedules" ADD CONSTRAINT "billing_payment_retry_schedules_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
