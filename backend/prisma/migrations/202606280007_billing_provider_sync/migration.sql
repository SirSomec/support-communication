-- CreateTable
CREATE TABLE "billing_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "billing_period" TEXT NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "unit_amount_monthly" INTEGER NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_invoice_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payment_status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_due" INTEGER NOT NULL,
    "amount_paid" INTEGER NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "hosted_invoice_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_provider_sync_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "sync_job_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_provider_sync_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_subscriptions_provider_subscription_key" ON "billing_subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE INDEX "billing_subscriptions_tenant_status_updated_at_idx" ON "billing_subscriptions"("tenant_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "billing_subscriptions_tenant_updated_at_idx" ON "billing_subscriptions"("tenant_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_provider_invoice_key" ON "billing_invoices"("provider", "provider_invoice_id");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_status_due_at_idx" ON "billing_invoices"("tenant_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_updated_at_idx" ON "billing_invoices"("tenant_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_provider_sync_events_idempotency_key_key" ON "billing_provider_sync_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "billing_provider_sync_events_tenant_provider_created_at_idx" ON "billing_provider_sync_events"("tenant_id", "provider", "created_at");

-- CreateIndex
CREATE INDEX "billing_provider_sync_events_status_created_at_idx" ON "billing_provider_sync_events"("status", "created_at");

-- AddForeignKey
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_provider_sync_events" ADD CONSTRAINT "billing_provider_sync_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
