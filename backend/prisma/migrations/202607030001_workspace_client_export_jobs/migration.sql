CREATE TABLE "client_export_jobs" (
  "export_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "segment" JSONB,
  "file_descriptor" JSONB NOT NULL,
  "audit_event" JSONB NOT NULL,
  "item_count" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "sensitive_fields_masked" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_export_jobs_pkey" PRIMARY KEY ("export_id"),
  CONSTRAINT "client_export_jobs_item_count_check" CHECK ("item_count" >= 0),
  CONSTRAINT "client_export_jobs_sensitive_fields_masked_check" CHECK ("sensitive_fields_masked" = true)
);

CREATE INDEX "client_export_jobs_tenant_created_idx"
  ON "client_export_jobs" ("tenant_id", "created_at");

CREATE INDEX "client_export_jobs_tenant_status_created_idx"
  ON "client_export_jobs" ("tenant_id", "status", "created_at");
