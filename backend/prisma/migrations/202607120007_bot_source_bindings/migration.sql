ALTER TABLE "bot_scenarios"
  ADD COLUMN "source_bindings" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "bot_scenario_versions"
  ADD COLUMN "source_bindings" JSONB NOT NULL DEFAULT '[]'::jsonb;
