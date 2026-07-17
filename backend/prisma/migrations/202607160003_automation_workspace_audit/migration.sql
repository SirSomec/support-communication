CREATE TABLE "automation_workspace_audit_events" (
  "audit_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "idempotency_key" TEXT,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "automation_workspace_audit_events_pkey" PRIMARY KEY ("audit_id")
);

CREATE UNIQUE INDEX "automation_workspace_audit_tenant_idempotency_key"
  ON "automation_workspace_audit_events" ("tenant_id", "idempotency_key");

CREATE INDEX "automation_workspace_audit_tenant_created_idx"
  ON "automation_workspace_audit_events" ("tenant_id", "created_at", "audit_id");
