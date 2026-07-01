CREATE TABLE "routing_analytics_rows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_kind" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "from_operator_id" TEXT,
  "to_operator_id" TEXT,
  "source" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "routing_analytics_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "routing_analytics_rows_tenant_event_kind_idx" ON "routing_analytics_rows"("tenant_id", "event_kind");
CREATE INDEX "routing_analytics_rows_tenant_occurred_at_idx" ON "routing_analytics_rows"("tenant_id", "occurred_at");
CREATE INDEX "routing_analytics_rows_tenant_conversation_idx" ON "routing_analytics_rows"("tenant_id", "conversation_id");
