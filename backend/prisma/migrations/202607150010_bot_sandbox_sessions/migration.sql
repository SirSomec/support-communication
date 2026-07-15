-- Sandbox chat sessions and their monthly token counter move from the JSON
-- store to Postgres (prisma-only runtime plan 2026-07-15, phase A3). Admin test
-- chats previously lived in .runtime/bot-sandbox-sessions.json; without a table
-- an admin's in-progress sandbox transcript is lost whenever the worker that
-- served it restarts, and the separate sandbox token budget resets silently.
-- Sessions stay TTL-bound (expires_at) and capped per tenant in application
-- code; nothing here ever reaches production dialogs or channel delivery.
CREATE TABLE "bot_sandbox_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scenario_id" TEXT NOT NULL,
    "scenario_name" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "current_node_id" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "turns" JSONB NOT NULL DEFAULT '[]',
    "usage" JSONB NOT NULL DEFAULT '{}',
    "webhooks_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bot_sandbox_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bot_sandbox_sessions_tenant_updated_idx" ON "bot_sandbox_sessions"("tenant_id", "updated_at");
CREATE INDEX "bot_sandbox_sessions_expires_at_idx" ON "bot_sandbox_sessions"("expires_at");

CREATE TABLE "bot_sandbox_usage_counters" (
    "tenant_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "used_tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bot_sandbox_usage_counters_pkey" PRIMARY KEY ("tenant_id", "month")
);
