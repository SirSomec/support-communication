CREATE TABLE "quality_ratings" (
  "rating_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "client_id" TEXT,
  "topic" TEXT,
  "scale" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "audit_id" TEXT NOT NULL,
  "realtime_event_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_ratings_pkey" PRIMARY KEY ("tenant_id", "rating_id"),
  CONSTRAINT "quality_ratings_scale_check" CHECK ("scale" IN ('CSAT', 'CSI', 'QA')),
  CONSTRAINT "quality_ratings_score_check" CHECK ("score" IS NULL OR "score" >= 0)
);

CREATE UNIQUE INDEX "quality_ratings_tenant_audit_key" ON "quality_ratings"("tenant_id", "audit_id");

CREATE UNIQUE INDEX "quality_ratings_tenant_realtime_event_key" ON "quality_ratings"("tenant_id", "realtime_event_id");

CREATE INDEX "quality_ratings_tenant_conversation_created_idx" ON "quality_ratings"("tenant_id", "conversation_id", "created_at");

CREATE INDEX "quality_ratings_tenant_channel_operator_created_idx" ON "quality_ratings"("tenant_id", "channel", "operator", "created_at");
