CREATE TABLE "quality_scoring_request_telemetry" (
  "telemetry_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL,
  "telemetry" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_scoring_request_telemetry_pkey" PRIMARY KEY ("tenant_id", "telemetry_id")
);

CREATE INDEX "quality_scoring_request_telemetry_tenant_recorded_idx"
  ON "quality_scoring_request_telemetry"("tenant_id", "recorded_at");

CREATE TABLE "quality_scoring_response_telemetry" (
  "telemetry_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "conversation_id" TEXT,
  "telemetry" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_scoring_response_telemetry_pkey" PRIMARY KEY ("tenant_id", "telemetry_id")
);

CREATE INDEX "quality_scoring_response_telemetry_tenant_status_recorded_idx"
  ON "quality_scoring_response_telemetry"("tenant_id", "status", "recorded_at");
CREATE INDEX "quality_scoring_response_telemetry_tenant_conv_recorded_idx"
  ON "quality_scoring_response_telemetry"("tenant_id", "conversation_id", "recorded_at");

CREATE TABLE "quality_scoring_failure_envelopes" (
  "failure_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL,
  "error_code" TEXT NOT NULL,
  "envelope" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quality_scoring_failure_envelopes_pkey" PRIMARY KEY ("tenant_id", "failure_id")
);

CREATE INDEX "quality_scoring_failure_envelopes_tenant_error_recorded_idx"
  ON "quality_scoring_failure_envelopes"("tenant_id", "error_code", "recorded_at");
