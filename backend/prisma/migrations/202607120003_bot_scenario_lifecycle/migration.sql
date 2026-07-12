ALTER TABLE "bot_scenarios"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "disabled_at" TIMESTAMPTZ(3),
  ADD COLUMN "disabled_by" TEXT,
  ADD COLUMN "disable_reason" TEXT,
  ADD COLUMN "archived_at" TIMESTAMPTZ(3),
  ADD COLUMN "archived_by" TEXT,
  ADD COLUMN "archive_reason" TEXT;

UPDATE "bot_scenarios"
SET
  "enabled" = FALSE,
  "disabled_at" = COALESCE("disabled_at", "updated_at"),
  "archived_at" = COALESCE("archived_at", "updated_at")
WHERE "status" = 'archived';

ALTER TABLE "bot_scenarios"
  ADD CONSTRAINT "bot_scenarios_archived_disabled_check"
  CHECK ("status" <> 'archived' OR "enabled" = FALSE),
  ADD CONSTRAINT "bot_scenarios_archived_timestamp_check"
  CHECK ("status" <> 'archived' OR "archived_at" IS NOT NULL);

CREATE INDEX "bot_scenarios_tenant_enabled_status_idx"
  ON "bot_scenarios"("tenant_id", "enabled", "status");
