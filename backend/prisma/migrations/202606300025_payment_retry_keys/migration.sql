CREATE TABLE "billing_payment_retry_keys" (
  "tenant_id" TEXT NOT NULL,
  "retry_key_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "schedule_id" TEXT,
  "provider" TEXT NOT NULL,
  "provider_invoice_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "first_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "last_attempt_at" TIMESTAMPTZ(3),
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payment_retry_keys_pkey" PRIMARY KEY ("tenant_id", "retry_key_id"),
  CONSTRAINT "billing_payment_retry_keys_status_check" CHECK ("status" IN ('claimed', 'failed', 'succeeded')),
  CONSTRAINT "billing_payment_retry_keys_attempt_check" CHECK ("attempt" >= 0)
);

CREATE UNIQUE INDEX "billing_payment_retry_keys_idempotency_key_key" ON "billing_payment_retry_keys"("idempotency_key");

CREATE INDEX "billing_retry_keys_tenant_invoice_status_first_idx" ON "billing_payment_retry_keys"("tenant_id", "invoice_id", "status", "first_attempt_at");

CREATE INDEX "billing_retry_keys_tenant_status_updated_idx" ON "billing_payment_retry_keys"("tenant_id", "status", "updated_at");

CREATE INDEX "billing_retry_keys_provider_invoice_idx" ON "billing_payment_retry_keys"("provider", "provider_invoice_id");

ALTER TABLE "billing_payment_retry_keys" ADD CONSTRAINT "billing_payment_retry_keys_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
