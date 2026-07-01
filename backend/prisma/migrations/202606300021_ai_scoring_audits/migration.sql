CREATE TABLE "ai_scoring_audits" (
  "audit_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "provider_result_id" TEXT,
  "queue" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "status" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_scoring_audits_pkey" PRIMARY KEY ("tenant_id", "audit_id"),
  CONSTRAINT "ai_scoring_audits_status_check" CHECK ("status" IN ('failed', 'ok')),
  CONSTRAINT "ai_scoring_audits_score_check" CHECK ("score" IS NULL OR "score" >= 0)
);

CREATE INDEX "ai_scoring_audits_tenant_conversation_created_idx" ON "ai_scoring_audits"("tenant_id", "conversation_id", "created_at");

CREATE INDEX "ai_scoring_audits_tenant_queue_status_created_idx" ON "ai_scoring_audits"("tenant_id", "queue", "status", "created_at");

CREATE INDEX "ai_scoring_audits_tenant_trace_idx" ON "ai_scoring_audits"("tenant_id", "trace_id");

CREATE INDEX "ai_scoring_audits_tenant_provider_result_idx" ON "ai_scoring_audits"("tenant_id", "provider_id", "provider_result_id");
