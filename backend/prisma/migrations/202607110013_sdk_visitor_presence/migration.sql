CREATE TABLE "sdk_visitor_presence_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "channel_connection_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "session_key_hash" TEXT NOT NULL,
  "page_url" TEXT,
  "page_path" TEXT,
  "referrer" TEXT,
  "connected" BOOLEAN NOT NULL DEFAULT true,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "disconnected_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sdk_visitor_presence_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sdk_presence_tenant_connection_session_key"
  ON "sdk_visitor_presence_sessions"("tenant_id", "channel_connection_id", "session_key_hash");
CREATE INDEX "sdk_presence_connected_expires_idx"
  ON "sdk_visitor_presence_sessions"("connected", "expires_at");
CREATE INDEX "sdk_presence_tenant_subject_seen_idx"
  ON "sdk_visitor_presence_sessions"("tenant_id", "subject_id", "last_seen_at");
