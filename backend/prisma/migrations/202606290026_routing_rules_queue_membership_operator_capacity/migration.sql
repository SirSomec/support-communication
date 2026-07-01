CREATE TABLE "routing_rules" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "limit_mode" TEXT NOT NULL,
  "wait_threshold_seconds" INTEGER NOT NULL,
  "priority_strategy" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "routing_rules_tenant_channel_key" ON "routing_rules"("tenant_id", "channel");
CREATE INDEX "routing_rules_tenant_enabled_idx" ON "routing_rules"("tenant_id", "enabled");

CREATE TABLE "queue_memberships" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "queue_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "queue_memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "queue_memberships_tenant_queue_operator_key" ON "queue_memberships"("tenant_id", "queue_id", "operator_id");
CREATE INDEX "queue_memberships_tenant_queue_active_idx" ON "queue_memberships"("tenant_id", "queue_id", "active");
CREATE INDEX "queue_memberships_tenant_operator_idx" ON "queue_memberships"("tenant_id", "operator_id");

CREATE TABLE "operator_capacities" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "chat_limit" INTEGER NOT NULL,
  "override_allowed" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "operator_capacities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operator_capacities_tenant_operator_channel_key" ON "operator_capacities"("tenant_id", "operator_id", "channel");
CREATE INDEX "operator_capacities_tenant_operator_idx" ON "operator_capacities"("tenant_id", "operator_id");
