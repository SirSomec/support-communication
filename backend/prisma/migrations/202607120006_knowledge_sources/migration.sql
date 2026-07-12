CREATE TABLE "knowledge_sources" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "readiness" TEXT NOT NULL DEFAULT 'not_ready',
  "approval_status" TEXT NOT NULL DEFAULT 'pending',
  "owner" TEXT NOT NULL,
  "source_ref" TEXT,
  "source_config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "content_checksum" TEXT,
  "approved_by" TEXT,
  "approved_at" TIMESTAMPTZ(3),
  "last_ingested_at" TIMESTAMPTZ(3),
  "last_indexed_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  "disabled_at" TIMESTAMPTZ(3),
  "archived_at" TIMESTAMPTZ(3),
  "retention_until" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "knowledge_sources_tenant_id_key" ON "knowledge_sources" ("tenant_id", "id");
CREATE INDEX "knowledge_sources_tenant_lifecycle_idx" ON "knowledge_sources" ("tenant_id", "status", "readiness", "approval_status");
CREATE INDEX "knowledge_sources_tenant_kind_updated_idx" ON "knowledge_sources" ("tenant_id", "kind", "updated_at");
CREATE INDEX "knowledge_sources_tenant_retrieval_idx" ON "knowledge_sources" ("tenant_id", "approval_status", "readiness", "version");
