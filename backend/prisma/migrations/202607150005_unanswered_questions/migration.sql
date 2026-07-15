-- Unanswered questions move from the JSON store to Postgres (prisma-only
-- runtime plan 2026-07-15, phase A2). This "training queue" of questions the
-- bot could not answer previously lived in .runtime/unanswered-questions.json
-- with no table at all. Question text is already PII-redacted by the caller.
CREATE TABLE "unanswered_questions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "channel" TEXT,
    "scenario_id" TEXT,
    "resolved_article_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "count" INTEGER NOT NULL DEFAULT 1,
    "first_asked_at" TIMESTAMPTZ(3) NOT NULL,
    "last_asked_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "unanswered_questions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "unanswered_questions_tenant_status_key_idx" ON "unanswered_questions"("tenant_id", "status", "normalized_key");
CREATE INDEX "unanswered_questions_tenant_last_asked_idx" ON "unanswered_questions"("tenant_id", "last_asked_at");
