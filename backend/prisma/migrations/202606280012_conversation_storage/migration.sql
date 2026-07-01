CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'tenant-volga',
  "name" TEXT NOT NULL,
  "initials" TEXT NOT NULL,
  "avatar" TEXT,
  "channel" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "time" TEXT NOT NULL,
  "preview" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sla" TEXT NOT NULL,
  "sla_tone" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "unread" BOOLEAN DEFAULT false,
  "device" TEXT NOT NULL,
  "entry" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "client_since" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "previous" JSONB NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_messages" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "side" TEXT,
  "type" TEXT,
  "text" TEXT NOT NULL,
  "author" TEXT,
  "time" TEXT NOT NULL,
  "attachments" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_inbound_events" (
  "id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trace_id" TEXT NOT NULL,
  "payload" JSONB,
  CONSTRAINT "conversation_inbound_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "conversation_realtime_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_name" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "resource_id" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "conversation_realtime_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_status_channel_idx" ON "conversations"("status", "channel");
CREATE INDEX "conversations_tenant_status_updated_at_idx" ON "conversations"("tenant_id", "status", "updated_at");

CREATE INDEX "conversation_messages_conversation_id_created_at_idx" ON "conversation_messages"("conversation_id", "created_at");

CREATE UNIQUE INDEX "conversation_inbound_events_channel_event_id_key" ON "conversation_inbound_events"("channel", "event_id");
CREATE INDEX "conversation_inbound_events_conversation_id_received_at_idx" ON "conversation_inbound_events"("conversation_id", "received_at");

CREATE UNIQUE INDEX "conversation_realtime_events_event_id_key" ON "conversation_realtime_events"("event_id");
CREATE INDEX "conversation_realtime_events_resource_idx" ON "conversation_realtime_events"("resource_type", "resource_id", "occurred_at");

ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_inbound_events" ADD CONSTRAINT "conversation_inbound_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
