CREATE TABLE "bot_publish_audit_events" (
  "audit_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "runtime_version" TEXT NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_publish_audit_events_pkey" PRIMARY KEY ("audit_id"),
  CONSTRAINT "bot_publish_audit_events_immutable_check" CHECK ("immutable" = true),
  CONSTRAINT "bot_publish_audit_events_version_fkey" FOREIGN KEY ("tenant_id", "scenario_id", "version_id") REFERENCES "bot_scenario_versions"("tenant_id", "scenario_id", "version_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bot_publish_audit_events_idempotency_key_key" ON "bot_publish_audit_events"("idempotency_key");

CREATE INDEX "bot_publish_audit_events_tenant_scenario_created_idx" ON "bot_publish_audit_events"("tenant_id", "scenario_id", "created_at");
