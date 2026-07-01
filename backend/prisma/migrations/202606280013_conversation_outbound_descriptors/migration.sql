CREATE TABLE "conversation_outbound_descriptors" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT,
  "message_id" TEXT,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "delivery_state" TEXT,
  "idempotency_key" TEXT,
  "retryable" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL,
  "audit_id" TEXT,
  "trace_id" TEXT NOT NULL,
  "outbox_event_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_outbound_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_outbound_descriptors_idempotency_key_key" ON "conversation_outbound_descriptors"("idempotency_key");
CREATE INDEX "conversation_outbound_descriptors_conversation_created_idx" ON "conversation_outbound_descriptors"("conversation_id", "created_at");
CREATE INDEX "conversation_outbound_descriptors_status_channel_created_idx" ON "conversation_outbound_descriptors"("status", "channel", "created_at");

ALTER TABLE "conversation_outbound_descriptors" ADD CONSTRAINT "conversation_outbound_descriptors_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
