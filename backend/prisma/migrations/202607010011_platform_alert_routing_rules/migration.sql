CREATE TABLE "platform_alert_routing_rules" (
  "id" TEXT NOT NULL,
  "component_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "statuses" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "severities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "destination_channel" TEXT NOT NULL,
  "destination_target" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_alert_routing_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_alert_routing_rules_enabled_updated_idx" ON "platform_alert_routing_rules"("enabled", "updated_at");

CREATE INDEX "platform_alert_routing_rules_destination_channel_idx" ON "platform_alert_routing_rules"("destination_channel");
