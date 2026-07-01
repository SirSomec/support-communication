CREATE TABLE "knowledge_approval_decisions" (
  "id" TEXT NOT NULL,
  "article_id" TEXT NOT NULL,
  "draft_id" TEXT,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "timestamp" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_approval_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_approval_decisions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "knowledge_approval_decisions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "knowledge_draft_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "knowledge_approval_decisions_article_id_timestamp_idx" ON "knowledge_approval_decisions"("article_id", "timestamp");
CREATE INDEX "knowledge_approval_decisions_draft_id_timestamp_idx" ON "knowledge_approval_decisions"("draft_id", "timestamp");
CREATE INDEX "knowledge_approval_decisions_action_timestamp_idx" ON "knowledge_approval_decisions"("action", "timestamp");
