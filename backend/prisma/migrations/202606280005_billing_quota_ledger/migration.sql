-- CreateTable
CREATE TABLE "billing_quota_ledger_entries" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "requested" INTEGER NOT NULL,
    "used" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "projected" INTEGER NOT NULL,
    "remaining_before" INTEGER NOT NULL,
    "remaining_after" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "reason" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_quota_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_quota_ledger_entries_idempotency_key_key" ON "billing_quota_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "billing_quota_ledger_entries_tenant_resource_created_at_idx" ON "billing_quota_ledger_entries"("tenant_id", "resource", "created_at");

-- CreateIndex
CREATE INDEX "billing_quota_ledger_tenant_resource_decision_idx" ON "billing_quota_ledger_entries"("tenant_id", "resource", "decision", "created_at");

-- CreateIndex
CREATE INDEX "billing_quota_ledger_entries_decision_created_at_idx" ON "billing_quota_ledger_entries"("decision", "created_at");

-- AddForeignKey
ALTER TABLE "billing_quota_ledger_entries" ADD CONSTRAINT "billing_quota_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
