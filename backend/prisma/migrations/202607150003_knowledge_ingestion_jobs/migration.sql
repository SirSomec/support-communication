-- Knowledge sources move from the JSON store to Postgres (prisma-only runtime
-- plan 2026-07-15, phase A1). The knowledge_sources table already existed;
-- document ingestion jobs never had one.
CREATE TABLE "knowledge_ingestion_jobs" (
    "job_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error_code" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_ingestion_jobs_pkey" PRIMARY KEY ("job_id")
);

CREATE UNIQUE INDEX "knowledge_ingestion_jobs_tenant_idempotency_key" ON "knowledge_ingestion_jobs"("tenant_id", "idempotency_key");
CREATE INDEX "knowledge_ingestion_jobs_status_created_idx" ON "knowledge_ingestion_jobs"("status", "created_at");
