CREATE UNIQUE INDEX "tenant_users_tenant_id_id_key" ON "tenant_users"("tenant_id", "id");

CREATE TABLE "teams" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teams_pkey" PRIMARY KEY ("tenant_id", "id")
);
CREATE INDEX "teams_tenant_status_name_idx" ON "teams"("tenant_id", "status", "name");

INSERT INTO "teams" ("id", "tenant_id", "name", "scope", "channels", "updated_at")
SELECT
  group_data->>'id',
  tenant."id",
  COALESCE(NULLIF(group_data->>'name', ''), group_data->>'id'),
  COALESCE(group_data->>'scope', ''),
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(group_data->'channels', '[]'::jsonb))),
  COALESCE((group_data->>'updatedAt')::timestamptz, CURRENT_TIMESTAMP)
FROM "tenants" tenant
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(tenant."metadata"->'employeeGroups', '[]'::jsonb)) group_data
WHERE COALESCE(group_data->>'id', '') <> ''
ON CONFLICT ("tenant_id", "id") DO NOTHING;

INSERT INTO "teams" ("id", "tenant_id", "name", "scope", "channels")
SELECT defaults."id", tenant."id", defaults."name", defaults."scope", defaults."channels"
FROM "tenants" tenant
CROSS JOIN (VALUES
  ('group-line-1', 'Line 1', 'First response', ARRAY['SDK', 'Telegram']::TEXT[]),
  ('group-vip', 'VIP support', 'High value clients', ARRAY['Telegram', 'MAX', 'VK']::TEXT[]),
  ('group-admins', 'Administrators', 'Settings and audit', ARRAY['SDK', 'Telegram', 'MAX', 'VK']::TEXT[])
) defaults("id", "name", "scope", "channels")
ON CONFLICT ("tenant_id", "id") DO NOTHING;

CREATE TABLE "team_memberships" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_memberships_team_fkey" FOREIGN KEY ("tenant_id", "team_id") REFERENCES "teams"("tenant_id", "id") ON DELETE CASCADE,
  CONSTRAINT "team_memberships_operator_fkey" FOREIGN KEY ("tenant_id", "operator_id") REFERENCES "tenant_users"("tenant_id", "id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "team_memberships_tenant_team_operator_key" ON "team_memberships"("tenant_id", "team_id", "operator_id");
CREATE INDEX "team_memberships_tenant_operator_active_idx" ON "team_memberships"("tenant_id", "operator_id", "active");

INSERT INTO "team_memberships" ("id", "tenant_id", "team_id", "operator_id")
SELECT 'tm_' || md5(user_row."tenant_id" || ':' || user_row."id" || ':' || resolved."team_id"),
       user_row."tenant_id", resolved."team_id", user_row."id"
FROM "tenant_users" user_row
CROSS JOIN LATERAL (SELECT COALESCE(
  NULLIF(user_row."metadata"->'employeeSettings'->>'groupId', ''),
  CASE
    WHEN lower(user_row."role") IN ('admin', 'administrator', 'owner') THEN 'group-admins'
    WHEN lower(user_row."role") IN ('senior', 'senior operator', 'lead') THEN 'group-vip'
    ELSE 'group-line-1'
  END
) AS "team_id") resolved
JOIN "teams" team ON team."tenant_id" = user_row."tenant_id" AND team."id" = resolved."team_id"
ON CONFLICT ("tenant_id", "team_id", "operator_id") DO NOTHING;

CREATE TABLE "support_queues" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "default_team_id" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_queues_pkey" PRIMARY KEY ("tenant_id", "id"),
  CONSTRAINT "support_queues_default_team_fkey" FOREIGN KEY ("tenant_id", "default_team_id") REFERENCES "teams"("tenant_id", "id") ON DELETE RESTRICT
);
CREATE INDEX "support_queues_tenant_status_name_idx" ON "support_queues"("tenant_id", "status", "name");

INSERT INTO "support_queues" ("id", "tenant_id", "name")
SELECT DISTINCT source."queue_id", source."tenant_id", source."queue_id"
FROM (
  SELECT "tenant_id", "routing_queue_id" AS "queue_id" FROM "integration_channel_connections"
  UNION
  SELECT "tenant_id", "queue_id" FROM "queue_memberships"
) source
WHERE COALESCE(source."queue_id", '') <> ''
ON CONFLICT ("tenant_id", "id") DO NOTHING;

ALTER TABLE "conversations" ADD COLUMN "queue_id" TEXT, ADD COLUMN "team_id" TEXT;
CREATE INDEX "conversations_tenant_queue_team_updated_at_idx" ON "conversations"("tenant_id", "queue_id", "team_id", "updated_at");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_queue_fkey" FOREIGN KEY ("tenant_id", "queue_id") REFERENCES "support_queues"("tenant_id", "id") ON DELETE RESTRICT;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_fkey" FOREIGN KEY ("tenant_id", "team_id") REFERENCES "teams"("tenant_id", "id") ON DELETE RESTRICT;
ALTER TABLE "queue_memberships" ADD CONSTRAINT "queue_memberships_queue_fkey" FOREIGN KEY ("tenant_id", "queue_id") REFERENCES "support_queues"("tenant_id", "id") ON DELETE CASCADE;
ALTER TABLE "integration_channel_connections" ADD CONSTRAINT "integration_channel_connections_queue_fkey" FOREIGN KEY ("tenant_id", "routing_queue_id") REFERENCES "support_queues"("tenant_id", "id") ON DELETE RESTRICT;
