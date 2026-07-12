CREATE TABLE "provider_attachment_transfers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "channel_connection_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "file_id" TEXT NOT NULL,
  "content_version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider_attachment_id" TEXT,
  "provider_attachment_token" TEXT,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_attachment_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "provider_attachment_transfers_status_check" CHECK ("status" IN ('pending', 'uploaded', 'failed')),
  CONSTRAINT "provider_attachment_transfers_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "provider_attachment_transfers_uploaded_reference_check" CHECK (
    "status" <> 'uploaded' OR "provider_attachment_id" IS NOT NULL OR "provider_attachment_token" IS NOT NULL
  )
);

CREATE UNIQUE INDEX "provider_attachment_transfers_identity_key"
  ON "provider_attachment_transfers"("tenant_id", "channel_connection_id", "provider", "file_id", "content_version");
CREATE INDEX "provider_attachment_transfers_connection_status_idx"
  ON "provider_attachment_transfers"("tenant_id", "channel_connection_id", "provider", "status");
CREATE INDEX "provider_attachment_transfers_file_updated_idx"
  ON "provider_attachment_transfers"("file_id", "updated_at");

ALTER TABLE "provider_attachment_transfers"
  ADD CONSTRAINT "provider_attachment_transfers_tenant_id_channel_connection_id_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id") REFERENCES "integration_channel_connections"("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "provider_attachment_transfers"
  ADD CONSTRAINT "provider_attachment_transfers_file_id_fkey"
  FOREIGN KEY ("file_id") REFERENCES "workspace_files"("file_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
