CREATE TABLE "integration_api_key_rotation_jobs" (
  "rotation_id" TEXT NOT NULL,
  "audit_id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "raw_key_shown_once" BOOLEAN NOT NULL,
  "requires_2fa" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_api_key_rotation_jobs_pkey" PRIMARY KEY ("rotation_id")
);

CREATE INDEX "integration_api_key_rotation_jobs_key_created_idx"
  ON "integration_api_key_rotation_jobs"("key_id", "created_at");
CREATE INDEX "integration_api_key_rotation_jobs_status_created_idx"
  ON "integration_api_key_rotation_jobs"("status", "created_at");

CREATE TABLE "public_demo_requests" (
  "id" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "consent" BOOLEAN NOT NULL,
  "email" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "ip_hash" TEXT,
  "message" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "plan_interest" TEXT,
  "request_fingerprint" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "user_agent_hash" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_demo_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_demo_requests_idempotency_key_key"
  ON "public_demo_requests"("idempotency_key");
CREATE UNIQUE INDEX "public_demo_requests_request_fingerprint_key"
  ON "public_demo_requests"("request_fingerprint");
CREATE INDEX "public_demo_requests_source_created_idx"
  ON "public_demo_requests"("source", "created_at");
CREATE INDEX "public_demo_requests_status_created_idx"
  ON "public_demo_requests"("status", "created_at");

CREATE TABLE "public_demo_request_audit_events" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "immutable" BOOLEAN NOT NULL,
  "lead_id" TEXT,
  "request_fingerprint" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  CONSTRAINT "public_demo_request_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_demo_request_audit_events_lead_at_idx"
  ON "public_demo_request_audit_events"("lead_id", "at");
CREATE INDEX "public_demo_request_audit_events_fingerprint_at_idx"
  ON "public_demo_request_audit_events"("request_fingerprint", "at");

CREATE TABLE "public_demo_request_notification_descriptors" (
  "id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "queue" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "public_demo_request_notification_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_demo_request_notification_descriptors_lead_idx"
  ON "public_demo_request_notification_descriptors"("lead_id");
CREATE INDEX "public_demo_request_notification_descriptors_queue_status_idx"
  ON "public_demo_request_notification_descriptors"("queue", "status", "created_at");

CREATE TABLE "webhook_replay_journal" (
  "idempotency_key" TEXT NOT NULL,
  "audit_id" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "original_trace_id" TEXT NOT NULL,
  "replay_id" TEXT NOT NULL,
  "signature_verified" BOOLEAN NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_replay_journal_pkey" PRIMARY KEY ("idempotency_key")
);

CREATE INDEX "webhook_replay_journal_delivery_idx"
  ON "webhook_replay_journal"("delivery_id");
CREATE INDEX "webhook_replay_journal_replay_idx"
  ON "webhook_replay_journal"("replay_id");

CREATE TABLE "webhook_replay_audit_events" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  "audit_id" TEXT NOT NULL,
  "delivery_id" TEXT NOT NULL,
  "delivery_status" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "immutable" BOOLEAN NOT NULL,
  "original_trace_id" TEXT NOT NULL,
  "replay_id" TEXT NOT NULL,
  "transition" TEXT NOT NULL,
  CONSTRAINT "webhook_replay_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_replay_audit_events_delivery_at_idx"
  ON "webhook_replay_audit_events"("delivery_id", "at");
CREATE INDEX "webhook_replay_audit_events_replay_at_idx"
  ON "webhook_replay_audit_events"("replay_id", "at");

CREATE TABLE "integration_security_sessions" (
  "id" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "last_seen" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "user" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_security_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_security_sessions_status_last_seen_idx"
  ON "integration_security_sessions"("status", "last_seen");

CREATE TABLE "integration_channel_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "chat_limit" INTEGER NOT NULL,
  "credentials_masked" BOOLEAN NOT NULL,
  "health" INTEGER NOT NULL,
  "raw_external_id" TEXT NOT NULL,
  "routing_queue_id" TEXT NOT NULL,
  "traffic" TEXT NOT NULL,
  "webhook_url" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sync_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "integration_channel_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_channel_connections_tenant_id_key"
  ON "integration_channel_connections"("tenant_id", "id");
CREATE INDEX "integration_channel_connections_tenant_type_status_idx"
  ON "integration_channel_connections"("tenant_id", "type", "status");

CREATE TABLE "integration_channel_connection_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "message" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  CONSTRAINT "integration_channel_connection_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_channel_connection_events_tenant_connection_idx"
  ON "integration_channel_connection_events"("tenant_id", "connection_id", "at");

CREATE TABLE "integration_channel_connection_audit_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "immutable" BOOLEAN NOT NULL,
  "reason" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  CONSTRAINT "integration_channel_connection_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_channel_conn_audit_tenant_conn_idx"
  ON "integration_channel_connection_audit_events"("tenant_id", "connection_id", "at");
CREATE INDEX "integration_channel_connection_audit_events_action_at_idx"
  ON "integration_channel_connection_audit_events"("action", "at");

CREATE TABLE "telegram_connections" (
  "tenant_id" TEXT NOT NULL,
  "bot_id" TEXT,
  "bot_token" TEXT NOT NULL,
  "bot_username" TEXT,
  "status" TEXT NOT NULL,
  "token_preview" TEXT NOT NULL,
  "webhook_secret" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("tenant_id")
);

CREATE UNIQUE INDEX "telegram_connections_webhook_secret_key"
  ON "telegram_connections"("webhook_secret");
CREATE INDEX "telegram_connections_status_updated_idx"
  ON "telegram_connections"("status", "updated_at");
