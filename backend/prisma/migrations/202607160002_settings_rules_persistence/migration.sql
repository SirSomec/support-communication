CREATE TABLE "settings_rules" (
  "tenant_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "affected_workflows" JSONB NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "last_changed_at" TIMESTAMPTZ(3) NOT NULL,
  "last_violation" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "parameters" JSONB NOT NULL,
  "scope" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  CONSTRAINT "settings_rules_pkey" PRIMARY KEY ("tenant_id", "id")
);

CREATE INDEX "settings_rules_tenant_severity_title_idx"
  ON "settings_rules" ("tenant_id", "severity", "title");

CREATE TABLE "settings_rule_audit_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settings_rule_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "settings_rule_audit_tenant_created_idx"
  ON "settings_rule_audit_events" ("tenant_id", "created_at", "id");
