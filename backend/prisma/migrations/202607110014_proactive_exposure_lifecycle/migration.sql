CREATE TABLE "proactive_exposures" (
  "exposure_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "presence_session_id" TEXT NOT NULL,
  "channel_connection_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "variant" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "experiment_version" TEXT NOT NULL,
  "segment_snapshot" JSONB NOT NULL DEFAULT '{}',
  "occurrence_key" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "planned_at" TIMESTAMPTZ(3) NOT NULL,
  "shown_at" TIMESTAMPTZ(3),
  "dismissed_at" TIMESTAMPTZ(3),
  "accepted_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "conversation_id" TEXT,
  "failure_code" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_exposures_pkey" PRIMARY KEY ("exposure_id"),
  CONSTRAINT "proactive_exposures_status_check" CHECK ("status" IN ('planned', 'shown', 'dismissed', 'accepted', 'failed'))
);
CREATE UNIQUE INDEX "proactive_exposures_occurrence_key" ON "proactive_exposures"("tenant_id", "rule_id", "subject_id", "occurrence_key");
CREATE INDEX "proactive_exposures_session_status_idx" ON "proactive_exposures"("tenant_id", "presence_session_id", "status", "planned_at");
CREATE INDEX "proactive_exposures_cooldown_idx" ON "proactive_exposures"("tenant_id", "rule_id", "subject_id", "planned_at");
