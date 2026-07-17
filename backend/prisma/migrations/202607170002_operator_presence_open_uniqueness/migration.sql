-- Repair any legacy duplicate open intervals before enforcing the invariant.
WITH ranked_open_intervals AS (
  SELECT
    "id",
    "started_at",
    FIRST_VALUE("started_at") OVER (
      PARTITION BY "tenant_id", "operator_id"
      ORDER BY "started_at" DESC, "id" DESC
    ) AS "current_started_at",
    ROW_NUMBER() OVER (
      PARTITION BY "tenant_id", "operator_id"
      ORDER BY "started_at" DESC, "id" DESC
    ) AS "position"
  FROM "operator_presence_intervals"
  WHERE "ended_at" IS NULL
)
UPDATE "operator_presence_intervals" AS interval
SET
  "ended_at" = GREATEST(interval."started_at", ranked."current_started_at"),
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked_open_intervals AS ranked
WHERE interval."id" = ranked."id"
  AND ranked."position" > 1;

CREATE UNIQUE INDEX "operator_presence_tenant_operator_open_uidx"
  ON "operator_presence_intervals"("tenant_id", "operator_id")
  WHERE "ended_at" IS NULL;
