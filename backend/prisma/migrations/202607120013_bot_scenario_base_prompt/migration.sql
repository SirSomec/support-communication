-- Additive: scenario-level base prompt for AI system instructions.
ALTER TABLE "bot_scenarios" ADD COLUMN IF NOT EXISTS "base_prompt" TEXT;
ALTER TABLE "bot_scenario_versions" ADD COLUMN IF NOT EXISTS "base_prompt" TEXT;
