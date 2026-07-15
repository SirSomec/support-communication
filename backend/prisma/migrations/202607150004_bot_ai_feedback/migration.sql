-- Bot AI feedback moves from the JSON store to Postgres (prisma-only runtime
-- plan 2026-07-15, phase A2). Operator ratings of bot answers previously lived
-- in .runtime/bot-ai-feedback.json with no table at all.
CREATE TABLE "bot_ai_feedback" (
    "feedback_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "scenario_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "comment" TEXT,
    "citation_source_ids" JSONB NOT NULL DEFAULT '[]',
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "resolved_action" TEXT,
    "resolved_at" TIMESTAMPTZ(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_ai_feedback_pkey" PRIMARY KEY ("feedback_id")
);

CREATE UNIQUE INDEX "bot_ai_feedback_tenant_idempotency_key" ON "bot_ai_feedback"("tenant_id", "idempotency_key");
CREATE INDEX "bot_ai_feedback_tenant_conversation_idx" ON "bot_ai_feedback"("tenant_id", "conversation_id");
