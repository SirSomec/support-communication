CREATE TABLE "billing_payment_dunning_states" (
  "tenant_id" TEXT NOT NULL,
  "dunning_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "subscription_id" TEXT,
  "provider" TEXT NOT NULL,
  "provider_invoice_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "last_failure_at" TIMESTAMPTZ(3),
  "next_action_at" TIMESTAMPTZ(3),
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_payment_dunning_states_pkey" PRIMARY KEY ("tenant_id", "dunning_id"),
  CONSTRAINT "billing_payment_dunning_states_status_check" CHECK ("status" IN ('active', 'canceled', 'paid', 'paused')),
  CONSTRAINT "billing_payment_dunning_states_stage_check" CHECK ("stage" IN ('final_notice', 'grace', 'initial')),
  CONSTRAINT "billing_payment_dunning_states_failed_attempts_check" CHECK ("failed_attempts" >= 0)
);

CREATE UNIQUE INDEX "billing_payment_dunning_states_idempotency_key_key" ON "billing_payment_dunning_states"("idempotency_key");

CREATE INDEX "billing_dunning_tenant_invoice_status_updated_idx" ON "billing_payment_dunning_states"("tenant_id", "invoice_id", "status", "updated_at");

CREATE INDEX "billing_dunning_tenant_status_next_action_idx" ON "billing_payment_dunning_states"("tenant_id", "status", "next_action_at");

CREATE INDEX "billing_dunning_provider_invoice_idx" ON "billing_payment_dunning_states"("provider", "provider_invoice_id");

ALTER TABLE "billing_payment_dunning_states" ADD CONSTRAINT "billing_payment_dunning_states_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
