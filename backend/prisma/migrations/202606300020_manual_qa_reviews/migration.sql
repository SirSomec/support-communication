CREATE TABLE "manual_qa_reviews" (
  "review_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "reviewer" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "criteria" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "override_reason" TEXT,
  "audit_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "manual_qa_reviews_pkey" PRIMARY KEY ("tenant_id", "review_id"),
  CONSTRAINT "manual_qa_reviews_score_check" CHECK ("score" IS NULL OR "score" >= 0)
);

CREATE UNIQUE INDEX "manual_qa_reviews_tenant_audit_key" ON "manual_qa_reviews"("tenant_id", "audit_id");

CREATE INDEX "manual_qa_reviews_tenant_conversation_created_idx" ON "manual_qa_reviews"("tenant_id", "conversation_id", "created_at");

CREATE INDEX "manual_qa_reviews_tenant_reviewer_created_idx" ON "manual_qa_reviews"("tenant_id", "reviewer", "created_at");
