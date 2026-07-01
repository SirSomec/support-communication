ALTER TABLE "workspace_files" ADD COLUMN "scan_checked_at" TIMESTAMPTZ(3);
ALTER TABLE "workspace_files" ADD COLUMN "scan_reason" TEXT;
ALTER TABLE "workspace_files" ADD COLUMN "scan_verdict" TEXT;
ALTER TABLE "workspace_files" ADD COLUMN "scanner" TEXT;

CREATE INDEX "workspace_files_scan_verdict_checked_at_idx" ON "workspace_files"("scan_verdict", "scan_checked_at");
