CREATE TABLE "webhook_delivery_journal" (
  "delivery_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "endpoint_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload_ref" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "target_url" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMPTZ(3),
  "last_error" JSONB,
  "locked_at" TIMESTAMPTZ(3),
  "next_attempt_at" TIMESTAMPTZ(3),
  "dead_lettered_at" TIMESTAMPTZ(3),
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_delivery_journal_pkey" PRIMARY KEY ("delivery_id")
);

CREATE UNIQUE INDEX "webhook_delivery_journal_idempotency_key_key" ON "webhook_delivery_journal"("idempotency_key");

CREATE INDEX "webhook_delivery_journal_status_queue_next_attempt_idx" ON "webhook_delivery_journal"("status", "queue", "next_attempt_at");

CREATE INDEX "webhook_delivery_journal_status_queue_locked_idx" ON "webhook_delivery_journal"("status", "queue", "locked_at");

CREATE INDEX "webhook_delivery_journal_tenant_endpoint_status_idx" ON "webhook_delivery_journal"("tenant_id", "endpoint_id", "status");

CREATE INDEX "webhook_delivery_journal_dead_letter_status_idx" ON "webhook_delivery_journal"("status", "dead_lettered_at");
