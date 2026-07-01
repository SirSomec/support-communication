CREATE TABLE "billing_approvals" (
  "tenant_id" TEXT NOT NULL,
  "approval_id" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "requested_by_name" TEXT NOT NULL,
  "decided_by" TEXT,
  "decided_by_name" TEXT,
  "decision_reason" TEXT,
  "trace_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "decided_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_approvals_pkey" PRIMARY KEY ("tenant_id", "approval_id"),
  CONSTRAINT "billing_approvals_status_check" CHECK ("status" IN ('approved', 'expired', 'pending', 'rejected')),
  CONSTRAINT "billing_approvals_subject_type_check" CHECK ("subject_type" IN ('payment_action', 'tariff_change'))
);

CREATE UNIQUE INDEX "billing_approvals_tenant_request_fingerprint_key" ON "billing_approvals"("tenant_id", "request_fingerprint");

CREATE INDEX "billing_approvals_tenant_status_expires_idx" ON "billing_approvals"("tenant_id", "status", "expires_at");

CREATE INDEX "billing_approvals_tenant_subject_status_idx" ON "billing_approvals"("tenant_id", "subject_type", "subject_id", "status");

CREATE INDEX "billing_approvals_tenant_created_idx" ON "billing_approvals"("tenant_id", "created_at");

ALTER TABLE "billing_approvals" ADD CONSTRAINT "billing_approvals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
