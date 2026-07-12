ALTER TABLE "bot_scenarios"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trigger_rules" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "bot_scenarios_tenant_trigger_priority_idx"
  ON "bot_scenarios" ("tenant_id", "enabled", "status", "priority");

ALTER TABLE "bot_scenario_versions"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trigger_rules" JSONB NOT NULL DEFAULT '[]'::jsonb;
