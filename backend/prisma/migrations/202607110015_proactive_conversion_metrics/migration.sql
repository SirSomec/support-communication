ALTER TABLE "proactive_exposures"
  ADD COLUMN "delivered_at" TIMESTAMPTZ(3),
  ADD COLUMN "attribution_window_ends_at" TIMESTAMPTZ(3);

CREATE INDEX "proactive_exposures_metrics_idx"
  ON "proactive_exposures"("tenant_id", "rule_id", "variant", "planned_at");

CREATE TABLE "proactive_conversion_events" (
  "conversion_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "exposure_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "variant" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "experiment_version" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "message_id" TEXT,
  "trigger" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_conversion_events_pkey" PRIMARY KEY ("conversion_id"),
  CONSTRAINT "proactive_conversion_events_trigger_check" CHECK ("trigger" IN ('message'))
);

CREATE UNIQUE INDEX "proactive_conversion_events_tenant_exposure_key"
  ON "proactive_conversion_events"("tenant_id", "exposure_id");
CREATE INDEX "proactive_conversion_events_metrics_idx"
  ON "proactive_conversion_events"("tenant_id", "rule_id", "variant", "occurred_at");
CREATE INDEX "proactive_conversion_events_conversation_idx"
  ON "proactive_conversion_events"("tenant_id", "conversation_id", "occurred_at");
