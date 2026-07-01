CREATE TABLE "billing_reconciliation_conflicts" (
  "tenant_id" TEXT NOT NULL,
  "conflict_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_invoice_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "expected" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "actual" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "resolution" TEXT,
  "resolved_at" TIMESTAMPTZ(3),
  "detected_at" TIMESTAMPTZ(3) NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_reconciliation_conflicts_pkey" PRIMARY KEY ("tenant_id", "conflict_id"),
  CONSTRAINT "billing_reconciliation_conflicts_status_check" CHECK ("status" IN ('ignored', 'open', 'resolved')),
  CONSTRAINT "billing_reconciliation_conflicts_severity_check" CHECK ("severity" IN ('high', 'low', 'medium'))
);

CREATE UNIQUE INDEX "billing_reconciliation_conflicts_idempotency_key_key" ON "billing_reconciliation_conflicts"("idempotency_key");

CREATE INDEX "billing_recon_conflicts_tenant_invoice_status_detected_idx" ON "billing_reconciliation_conflicts"("tenant_id", "invoice_id", "status", "detected_at");

CREATE INDEX "billing_recon_conflicts_tenant_status_severity_updated_idx" ON "billing_reconciliation_conflicts"("tenant_id", "status", "severity", "updated_at");

CREATE INDEX "billing_recon_conflicts_provider_invoice_idx" ON "billing_reconciliation_conflicts"("provider", "provider_invoice_id");

ALTER TABLE "billing_reconciliation_conflicts" ADD CONSTRAINT "billing_reconciliation_conflicts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
