UPDATE "automation_bot_test_runs" AS run
SET "tenant_id" = scenario."tenant_id"
FROM "bot_scenarios" AS scenario
WHERE run."tenant_id" IS NULL
  AND run."scenario_id" = scenario."id";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "automation_bot_test_runs" WHERE "tenant_id" IS NULL) THEN
    RAISE EXCEPTION 'automation_bot_test_runs contains rows whose tenant cannot be inferred from bot_scenarios';
  END IF;
END $$;

ALTER TABLE "automation_bot_test_runs" ALTER COLUMN "tenant_id" SET NOT NULL;
