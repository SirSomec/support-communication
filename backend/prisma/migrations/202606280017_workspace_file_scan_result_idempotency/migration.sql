CREATE TABLE "workspace_file_scan_result_idempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_file_scan_result_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_file_scan_result_idempotency_key_key" ON "workspace_file_scan_result_idempotency"("key");
CREATE INDEX "workspace_file_scan_result_idem_file_created_idx" ON "workspace_file_scan_result_idempotency"("file_id", "created_at");
