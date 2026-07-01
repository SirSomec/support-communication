CREATE TABLE "platform_telemetry_samples" (
  "id" TEXT NOT NULL,
  "component_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "metric_key" TEXT NOT NULL,
  "sampled_at" TIMESTAMPTZ(3) NOT NULL,
  "source" TEXT NOT NULL,
  "tags" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "unit" TEXT NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_telemetry_samples_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_telemetry_samples_component_metric_sampled_idx" ON "platform_telemetry_samples"("component_id", "metric_key", "sampled_at");

CREATE INDEX "platform_telemetry_samples_tenant_metric_sampled_idx" ON "platform_telemetry_samples"("tenant_id", "metric_key", "sampled_at");

CREATE INDEX "platform_telemetry_samples_sampled_at_idx" ON "platform_telemetry_samples"("sampled_at");
