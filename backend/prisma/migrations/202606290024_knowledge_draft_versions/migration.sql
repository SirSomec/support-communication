CREATE TABLE "knowledge_draft_versions" (
  "id" TEXT NOT NULL,
  "article_id" TEXT NOT NULL,
  "author" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "changes" TEXT,
  "label" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_draft_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "knowledge_draft_versions_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "knowledge_draft_versions_article_id_id_key" ON "knowledge_draft_versions"("article_id", "id");
CREATE INDEX "knowledge_draft_versions_article_id_updated_at_idx" ON "knowledge_draft_versions"("article_id", "updated_at");
CREATE INDEX "knowledge_draft_versions_article_id_status_idx" ON "knowledge_draft_versions"("article_id", "status");
