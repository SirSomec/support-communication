CREATE TABLE "report_export_jobs" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "status_key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "progress" INTEGER NOT NULL,
  "requested_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "rows" INTEGER NOT NULL,
  "columns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "filters" JSONB NOT NULL DEFAULT '{}',
  "backend_queue_id" TEXT,
  "audit_id" TEXT NOT NULL,
  "metric_definition_version" TEXT,
  "queue" TEXT,
  "file_name" TEXT,
  "failure_code" TEXT,
  "failure_message" TEXT,
  "dead_lettered_at" TIMESTAMPTZ(3),
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_export_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_export_jobs_format_check" CHECK ("format" IN ('CSV', 'PDF', 'XLSX')),
  CONSTRAINT "report_export_jobs_status_key_check" CHECK ("status_key" IN ('error', 'expired', 'queued', 'ready', 'running'))
);

CREATE INDEX "report_export_jobs_queue_status_created_idx" ON "report_export_jobs" ("queue", "status_key", "created_at");
CREATE INDEX "report_export_jobs_status_created_idx" ON "report_export_jobs" ("status_key", "created_at");
