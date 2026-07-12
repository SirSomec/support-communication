ALTER TABLE "report_idempotency_keys" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "automation_publish_idempotency_keys" ADD COLUMN "tenant_id" TEXT;

WITH report_tenant_candidates AS (
  SELECT "key", MIN("tenant_id") AS "tenant_id"
  FROM (
    SELECT idempotency."key", export_job."tenant_id"
    FROM "report_idempotency_keys" AS idempotency
    JOIN "report_export_jobs" AS export_job ON export_job."id" = idempotency."job_id"
    UNION ALL
    SELECT idempotency."key", template."tenant_id"
    FROM "report_idempotency_keys" AS idempotency
    JOIN "saved_report_templates" AS template ON template."id" = idempotency."job_id"
  ) AS candidates
  GROUP BY "key"
  HAVING COUNT(DISTINCT "tenant_id") = 1
)
UPDATE "report_idempotency_keys" AS idempotency
SET "tenant_id" = candidates."tenant_id"
FROM report_tenant_candidates AS candidates
WHERE candidates."key" = idempotency."key";

WITH automation_tenant_candidates AS (
  SELECT "key", MIN("tenant_id") AS "tenant_id"
  FROM (
    SELECT idempotency."key", NULLIF(BTRIM(idempotency."result" ->> 'tenantId'), '') AS "tenant_id"
    FROM "automation_publish_idempotency_keys" AS idempotency
    UNION ALL
    SELECT idempotency."key", scenario."tenant_id"
    FROM "automation_publish_idempotency_keys" AS idempotency
    JOIN "bot_scenarios" AS scenario ON scenario."id" = idempotency."result" ->> 'scenarioId'
    UNION ALL
    SELECT idempotency."key", audit."tenant_id"
    FROM "automation_publish_idempotency_keys" AS idempotency
    JOIN "bot_publish_audit_events" AS audit ON audit."audit_id" = idempotency."result" ->> 'auditId'
  ) AS candidates
  WHERE "tenant_id" IS NOT NULL
  GROUP BY "key"
  HAVING COUNT(DISTINCT "tenant_id") = 1
)
UPDATE "automation_publish_idempotency_keys" AS idempotency
SET "tenant_id" = candidates."tenant_id"
FROM automation_tenant_candidates AS candidates
WHERE candidates."key" = idempotency."key";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "report_idempotency_keys" WHERE "tenant_id" IS NULL OR BTRIM("tenant_id") = '') THEN
    RAISE EXCEPTION 'Cannot tenant-scope report_idempotency_keys: unresolved or conflicting tenant rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM "automation_publish_idempotency_keys" WHERE "tenant_id" IS NULL OR BTRIM("tenant_id") = '') THEN
    RAISE EXCEPTION 'Cannot tenant-scope automation_publish_idempotency_keys: unresolved or conflicting tenant rows remain';
  END IF;
END $$;

ALTER TABLE "report_idempotency_keys" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "report_idempotency_keys" DROP CONSTRAINT "report_idempotency_keys_pkey";
ALTER TABLE "report_idempotency_keys"
  ADD CONSTRAINT "report_idempotency_keys_pkey" PRIMARY KEY ("tenant_id", "key");

ALTER TABLE "automation_publish_idempotency_keys" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "automation_publish_idempotency_keys" DROP CONSTRAINT "automation_publish_idempotency_keys_pkey";
ALTER TABLE "automation_publish_idempotency_keys"
  ADD CONSTRAINT "automation_publish_idempotency_keys_pkey" PRIMARY KEY ("tenant_id", "key");
