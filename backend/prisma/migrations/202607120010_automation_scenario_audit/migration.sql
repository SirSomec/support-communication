CREATE TABLE "automation_scenario_audit_events" (
  "audit_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "fingerprint" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "immutable" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_scenario_audit_events_pkey" PRIMARY KEY ("audit_id"),
  CONSTRAINT "automation_scenario_audit_events_immutable_check" CHECK ("immutable" = TRUE)
);
CREATE UNIQUE INDEX "automation_scenario_audit_tenant_idempotency_key"
  ON "automation_scenario_audit_events"("tenant_id", "idempotency_key");
CREATE INDEX "automation_scenario_audit_tenant_scenario_created_idx"
  ON "automation_scenario_audit_events"("tenant_id", "scenario_id", "created_at");
