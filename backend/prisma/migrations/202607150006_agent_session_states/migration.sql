-- Agent session state moves from the JSON store to Postgres (prisma-only
-- runtime plan 2026-07-15, phase A2). Compact per-conversation agent memory
-- (facts, recent turns, summary) previously lived in
-- .runtime/agent-session-state.json with no table; without it the bot's
-- dialogue context is lost on every restart.
CREATE TABLE "agent_session_states" (
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT NOT NULL DEFAULT '',
    "intent" TEXT,
    "open_question" TEXT,
    "scenario_revision_id" TEXT,
    "facts" JSONB NOT NULL DEFAULT '[]',
    "recent_turns" JSONB NOT NULL DEFAULT '[]',
    "token_estimate" INTEGER NOT NULL DEFAULT 0,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agent_session_states_pkey" PRIMARY KEY ("tenant_id", "conversation_id")
);

CREATE INDEX "agent_session_states_expires_at_idx" ON "agent_session_states"("expires_at");
