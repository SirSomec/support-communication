CREATE TABLE "proactive_frequency_caps" (
  "cap_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "limit" INTEGER NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0,
  "reset_at" TIMESTAMPTZ(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_frequency_caps_pkey" PRIMARY KEY ("cap_id"),
  CONSTRAINT "proactive_frequency_caps_period_check" CHECK ("period" IN ('hour', 'day', 'week')),
  CONSTRAINT "proactive_frequency_caps_limit_check" CHECK ("limit" >= 0),
  CONSTRAINT "proactive_frequency_caps_used_check" CHECK ("used" >= 0)
);

CREATE UNIQUE INDEX "proactive_frequency_caps_tenant_rule_cap_key" ON "proactive_frequency_caps"("tenant_id", "rule_id", "cap_id");

CREATE INDEX "proactive_frequency_caps_tenant_rule_active_idx" ON "proactive_frequency_caps"("tenant_id", "rule_id", "active");

CREATE INDEX "proactive_frequency_caps_tenant_active_reset_idx" ON "proactive_frequency_caps"("tenant_id", "active", "reset_at");
