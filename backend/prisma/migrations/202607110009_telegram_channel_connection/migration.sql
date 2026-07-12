ALTER TABLE "telegram_connections" ADD COLUMN "channel_connection_id" TEXT;

UPDATE "telegram_connections" telegram
SET "channel_connection_id" = connection."id"
FROM "integration_channel_connections" connection
WHERE connection."tenant_id" = telegram."tenant_id"
  AND lower(connection."type") = 'telegram'
  AND connection."raw_external_id" = 'telegram:' || COALESCE(telegram."bot_username", telegram."bot_id", 'bot');

WITH single_connection AS (
  SELECT "tenant_id", min("id") AS "id", count(*) AS "count"
  FROM "integration_channel_connections"
  WHERE lower("type") = 'telegram'
  GROUP BY "tenant_id"
)
UPDATE "telegram_connections" telegram
SET "channel_connection_id" = single_connection."id"
FROM single_connection
WHERE telegram."channel_connection_id" IS NULL
  AND single_connection."tenant_id" = telegram."tenant_id"
  AND single_connection."count" = 1;

INSERT INTO "support_queues" ("tenant_id", "id", "name")
SELECT telegram."tenant_id", 'queue-telegram-legacy', 'Telegram legacy'
FROM "telegram_connections" telegram
WHERE telegram."channel_connection_id" IS NULL
ON CONFLICT ("tenant_id", "id") DO NOTHING;

INSERT INTO "integration_channel_connections" (
  "id", "tenant_id", "type", "name", "status", "environment", "chat_limit",
  "credentials_masked", "health", "raw_external_id", "routing_queue_id", "traffic",
  "webhook_url", "last_sync_at"
)
SELECT
  'conn_telegram_legacy_' || md5(telegram."tenant_id"), telegram."tenant_id", 'telegram',
  'Telegram legacy', telegram."status", 'production', 8, true, 100,
  'telegram:' || COALESCE(telegram."bot_username", telegram."bot_id", 'bot'),
  'queue-telegram-legacy', 'legacy', '', CURRENT_TIMESTAMP
FROM "telegram_connections" telegram
WHERE telegram."channel_connection_id" IS NULL
ON CONFLICT ("id") DO NOTHING;

UPDATE "telegram_connections"
SET "channel_connection_id" = 'conn_telegram_legacy_' || md5("tenant_id")
WHERE "channel_connection_id" IS NULL;

ALTER TABLE "telegram_connections" DROP CONSTRAINT "telegram_connections_pkey";
ALTER TABLE "telegram_connections" ALTER COLUMN "channel_connection_id" SET NOT NULL;
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_pkey" PRIMARY KEY ("channel_connection_id");
CREATE UNIQUE INDEX "telegram_connections_tenant_channel_key" ON "telegram_connections"("tenant_id", "channel_connection_id");
ALTER TABLE "telegram_connections" ADD CONSTRAINT "telegram_connections_channel_connection_fkey"
  FOREIGN KEY ("tenant_id", "channel_connection_id")
  REFERENCES "integration_channel_connections"("tenant_id", "id") ON DELETE CASCADE;
CREATE INDEX "telegram_connections_tenant_status_updated_idx"
  ON "telegram_connections"("tenant_id", "status", "updated_at");
