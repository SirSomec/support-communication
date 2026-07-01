CREATE TABLE "channel_delivery_receipts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_event_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL,
  "trace_id" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_delivery_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_delivery_receipts_idempotency_key_key" ON "channel_delivery_receipts"("idempotency_key");
CREATE UNIQUE INDEX "channel_delivery_receipts_provider_event_key" ON "channel_delivery_receipts"("provider", "provider_event_id");
CREATE INDEX "channel_delivery_receipts_message_received_at_idx" ON "channel_delivery_receipts"("message_id", "received_at");
CREATE INDEX "channel_delivery_receipts_tenant_channel_received_at_idx" ON "channel_delivery_receipts"("tenant_id", "channel", "received_at");

ALTER TABLE "channel_delivery_receipts"
  ADD CONSTRAINT "channel_delivery_receipts_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
