CREATE TABLE "knowledge_articles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'tenant-volga',
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "visibility" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "owner" TEXT NOT NULL,
  "usage" INTEGER NOT NULL DEFAULT 0,
  "helpful_rate" INTEGER NOT NULL DEFAULT 0,
  "body" TEXT NOT NULL,
  "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "versions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "approval_history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_articles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_articles_tenant_visibility_status_updated_at_idx" ON "knowledge_articles"("tenant_id", "visibility", "status", "updated_at");
CREATE INDEX "knowledge_articles_tenant_category_idx" ON "knowledge_articles"("tenant_id", "category");
