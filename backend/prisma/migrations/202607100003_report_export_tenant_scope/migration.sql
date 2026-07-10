ALTER TABLE "report_export_jobs"
ADD COLUMN "tenant_id" TEXT NOT NULL DEFAULT 'tenant-volga';

ALTER TABLE "report_export_jobs"
ALTER COLUMN "tenant_id" DROP DEFAULT;

CREATE INDEX "report_export_jobs_tenant_created_idx"
ON "report_export_jobs"("tenant_id", "created_at");

CREATE INDEX "report_export_jobs_tenant_status_created_idx"
ON "report_export_jobs"("tenant_id", "status_key", "created_at");
