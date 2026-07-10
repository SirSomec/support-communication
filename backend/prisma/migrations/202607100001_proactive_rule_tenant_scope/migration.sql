ALTER TABLE "proactive_rules"
  ADD COLUMN "tenant_id" TEXT;

UPDATE "proactive_rules"
SET "tenant_id" = 'tenant-volga'
WHERE "tenant_id" IS NULL;

ALTER TABLE "proactive_rules"
  ALTER COLUMN "tenant_id" SET NOT NULL;

DROP INDEX IF EXISTS "proactive_rules_status_idx";

CREATE INDEX "proactive_rules_tenant_status_idx"
  ON "proactive_rules"("tenant_id", "status");
