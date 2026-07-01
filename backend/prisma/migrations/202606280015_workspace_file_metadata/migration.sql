CREATE TABLE "workspace_files" (
    "file_id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "checksum" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "scan_state" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "storage_state" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_files_pkey" PRIMARY KEY ("file_id")
);

CREATE INDEX "workspace_files_tenant_file_id_idx" ON "workspace_files"("tenant_id", "file_id");
CREATE INDEX "workspace_files_storage_scan_state_idx" ON "workspace_files"("storage_state", "scan_state");
CREATE INDEX "workspace_files_channel_created_at_idx" ON "workspace_files"("channel", "created_at");
