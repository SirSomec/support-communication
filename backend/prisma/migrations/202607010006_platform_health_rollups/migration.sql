CREATE TABLE "platform_health_rollups" (
  "id" TEXT NOT NULL,
  "component_id" TEXT NOT NULL,
  "window_start" TIMESTAMPTZ(3) NOT NULL,
  "window_end" TIMESTAMPTZ(3) NOT NULL,
  "generated_at" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "availability" DOUBLE PRECISION NOT NULL,
  "error_rate" DOUBLE PRECISION NOT NULL,
  "latency_p95_ms" INTEGER NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "incident_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_health_rollups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_health_rollups_component_window_end_idx" ON "platform_health_rollups"("component_id", "window_end");

CREATE INDEX "platform_health_rollups_status_window_end_idx" ON "platform_health_rollups"("status", "window_end");

CREATE INDEX "platform_health_rollups_window_end_idx" ON "platform_health_rollups"("window_end");
