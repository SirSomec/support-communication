CREATE TABLE "ai_suggestion_decisions" (
  "decision_id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "suggestion_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL, "action" TEXT NOT NULL, "original_text" TEXT NOT NULL,
  "original_text_hash" TEXT NOT NULL, "final_text" TEXT, "final_text_hash" TEXT,
  "operator_id" TEXT NOT NULL, "operator_name" TEXT, "provider_id" TEXT,
  "provider_result_id" TEXT, "scoring_audit_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_suggestion_decisions_pkey" PRIMARY KEY ("tenant_id", "decision_id"),
  CONSTRAINT "ai_suggestion_decisions_action_check" CHECK ("action" IN ('accept', 'edit', 'reject')),
  CONSTRAINT "ai_suggestion_decisions_final_text_check" CHECK (("action" = 'reject' AND "final_text" IS NULL AND "final_text_hash" IS NULL) OR ("action" IN ('accept', 'edit') AND "final_text" IS NOT NULL AND "final_text_hash" IS NOT NULL))
);
CREATE UNIQUE INDEX "ai_suggestion_decisions_tenant_suggestion_key" ON "ai_suggestion_decisions"("tenant_id", "suggestion_id");
CREATE INDEX "ai_suggestion_decisions_tenant_conversation_created_idx" ON "ai_suggestion_decisions"("tenant_id", "conversation_id", "created_at");
CREATE INDEX "ai_suggestion_decisions_tenant_action_created_idx" ON "ai_suggestion_decisions"("tenant_id", "action", "created_at");
CREATE INDEX "ai_suggestion_decisions_tenant_provider_result_idx" ON "ai_suggestion_decisions"("tenant_id", "provider_id", "provider_result_id");
