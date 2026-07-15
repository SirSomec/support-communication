-- Open Channel compatibility layer (External Bot API / Event Webhooks).
-- Additive, standalone tables (no tenant FK), matching the ai_connections /
-- knowledge_sources / mcp_connectors convention.

CREATE TABLE "open_channel_chat_channels" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "outbound_url" TEXT NOT NULL,
  "routing_queue_id" TEXT,
  "status" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_chat_channels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "open_channel_chat_channels_token_key" ON "open_channel_chat_channels" ("token");
CREATE UNIQUE INDEX "open_channel_chat_channels_tenant_id_key" ON "open_channel_chat_channels" ("tenant_id", "id");
CREATE INDEX "open_channel_chat_channels_tenant_status_idx" ON "open_channel_chat_channels" ("tenant_id", "status");

CREATE TABLE "open_channel_external_bot_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channels_all" BOOLEAN NOT NULL DEFAULT false,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "provider_url" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_external_bot_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "open_channel_external_bot_connections_tenant_id_key" ON "open_channel_external_bot_connections" ("tenant_id", "id");
CREATE INDEX "open_channel_external_bot_connections_tenant_status_idx" ON "open_channel_external_bot_connections" ("tenant_id", "status");
CREATE INDEX "open_channel_external_bot_connections_token_idx" ON "open_channel_external_bot_connections" ("token");

CREATE TABLE "open_channel_event_webhook_subscriptions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "events_all" BOOLEAN NOT NULL DEFAULT false,
  "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_event_webhook_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "open_channel_event_webhook_subscriptions_tenant_id_key" ON "open_channel_event_webhook_subscriptions" ("tenant_id", "id");
CREATE INDEX "open_channel_event_webhook_subscriptions_tenant_status_idx" ON "open_channel_event_webhook_subscriptions" ("tenant_id", "status");

CREATE TABLE "open_channel_conversation_states" (
  "conversation_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "attributes" JSONB,
  "bot_state" TEXT,
  "chat_channel_id" TEXT,
  "client_id" TEXT,
  "custom_data" JSONB,
  "last_delivered_agent_message_id" TEXT,
  "rate_requested" BOOLEAN,
  "user_token" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_conversation_states_pkey" PRIMARY KEY ("conversation_id")
);
CREATE INDEX "open_channel_conversation_states_tenant_idx" ON "open_channel_conversation_states" ("tenant_id");

CREATE TABLE "open_channel_deliveries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "event_name" TEXT NOT NULL,
  "conversation_id" TEXT,
  "url" TEXT NOT NULL,
  "body" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "retry_backoff_ms" INTEGER NOT NULL,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL,
  "last_error" TEXT,
  "last_response_body" TEXT,
  "last_status_code" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "open_channel_deliveries_tenant_kind_status_idx" ON "open_channel_deliveries" ("tenant_id", "kind", "status");
CREATE INDEX "open_channel_deliveries_status_next_attempt_idx" ON "open_channel_deliveries" ("status", "next_attempt_at");
CREATE INDEX "open_channel_deliveries_created_at_idx" ON "open_channel_deliveries" ("created_at");

CREATE TABLE "open_channel_pump_cursors" (
  "id" TEXT NOT NULL,
  "last_occurred_at" TEXT NOT NULL,
  "seen_event_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "open_channel_pump_cursors_pkey" PRIMARY KEY ("id")
);
