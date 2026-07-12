ALTER TABLE "conversations"
  ADD COLUMN "channel_connection_id" TEXT,
  ADD COLUMN "provider_conversation_id" TEXT,
  ADD COLUMN "provider_user_id" TEXT;

CREATE TABLE "provider_connection_credentials" (
  "channel_connection_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "external_account_id" TEXT NOT NULL,
  "access_token_encrypted" TEXT NOT NULL,
  "webhook_secret_encrypted" TEXT NOT NULL,
  "confirmation_code_encrypted" TEXT,
  "key_version" TEXT NOT NULL,
  "api_version" TEXT,
  "status" TEXT NOT NULL,
  "last_webhook_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_connection_credentials_pkey" PRIMARY KEY ("channel_connection_id")
);

CREATE TABLE "provider_message_bindings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "channel_connection_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "internal_message_id" TEXT NOT NULL,
  "provider_conversation_id" TEXT NOT NULL,
  "provider_message_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_message_bindings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversations_tenant_connection_provider_key" ON "conversations"("tenant_id", "channel_connection_id", "provider_conversation_id");
CREATE UNIQUE INDEX "provider_connection_credentials_tenant_channel_key" ON "provider_connection_credentials"("tenant_id", "channel_connection_id");
CREATE INDEX "provider_connection_credentials_tenant_provider_status_idx" ON "provider_connection_credentials"("tenant_id", "provider", "status");
CREATE UNIQUE INDEX "provider_message_bindings_provider_message_key" ON "provider_message_bindings"("tenant_id", "channel_connection_id", "provider_message_id");
CREATE UNIQUE INDEX "provider_message_bindings_internal_provider_key" ON "provider_message_bindings"("tenant_id", "internal_message_id", "provider");
CREATE INDEX "provider_message_bindings_conversation_idx" ON "provider_message_bindings"("tenant_id", "provider_conversation_id", "created_at");

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_channel_connection_id_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id") REFERENCES "integration_channel_connections"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provider_connection_credentials" ADD CONSTRAINT "provider_connection_credentials_tenant_id_channel_connection_id_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id") REFERENCES "integration_channel_connections"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_message_bindings" ADD CONSTRAINT "provider_message_bindings_tenant_id_channel_connection_id_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id") REFERENCES "integration_channel_connections"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_message_bindings" ADD CONSTRAINT "provider_message_bindings_tenant_id_conversation_id_fkey"
  FOREIGN KEY ("tenant_id", "conversation_id") REFERENCES "conversations"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_message_bindings" ADD CONSTRAINT "provider_message_bindings_internal_message_id_fkey"
  FOREIGN KEY ("internal_message_id") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
