ALTER TABLE "ai_scoring_audits"
  ADD COLUMN "request_fingerprint" TEXT,
  ADD COLUMN "result_snapshot" JSONB,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ai_scoring_audits"
  DROP CONSTRAINT "ai_scoring_audits_status_check";

ALTER TABLE "ai_scoring_audits"
  ADD CONSTRAINT "ai_scoring_audits_status_check" CHECK ("status" IN ('pending', 'failed', 'ok'));

CREATE INDEX "ai_scoring_audits_tenant_status_updated_idx"
  ON "ai_scoring_audits"("tenant_id", "status", "updated_at");
