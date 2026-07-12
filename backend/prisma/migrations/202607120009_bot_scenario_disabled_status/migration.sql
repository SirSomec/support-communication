ALTER TABLE "bot_scenarios"
  DROP CONSTRAINT IF EXISTS "bot_scenarios_status_check";

ALTER TABLE "bot_scenarios"
  ADD CONSTRAINT "bot_scenarios_status_check"
  CHECK ("status" IN ('draft', 'published', 'disabled', 'archived'));
