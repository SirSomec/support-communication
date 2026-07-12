ALTER TABLE "public_api_keys" ADD COLUMN "channel_connection_id" TEXT;

WITH candidate AS (
  SELECT connection."tenant_id", min(connection."id") AS "id", count(*) AS "count"
  FROM "integration_channel_connections" connection
  WHERE lower(connection."type") = 'sdk'
    AND lower(connection."status") = 'active'
  GROUP BY connection."tenant_id"
)
UPDATE "public_api_keys" key
SET "channel_connection_id" = candidate."id"
FROM candidate
WHERE candidate."tenant_id" = key."tenant_id" AND candidate."count" = 1;

ALTER TABLE "public_api_keys"
  ADD CONSTRAINT "public_api_keys_channel_connection_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id")
  REFERENCES "integration_channel_connections"("tenant_id", "id")
  ON DELETE RESTRICT;

CREATE INDEX "public_api_keys_tenant_channel_connection_idx"
  ON "public_api_keys"("tenant_id", "channel_connection_id", "status");
