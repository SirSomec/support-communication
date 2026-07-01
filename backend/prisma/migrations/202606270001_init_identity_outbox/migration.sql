CREATE TABLE "tenants" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "health_score" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_audit_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "reason" TEXT,
  "result" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  CONSTRAINT "tenant_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "mfa_challenges" (
  "id" TEXT NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "email" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_admin_sessions" (
  "id" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "admin_email" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "admin_name" TEXT NOT NULL,
  "allowed_actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "auth_state" TEXT NOT NULL,
  "available_organizations" JSONB NOT NULL,
  "current_tenant_id" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "mfa_verified_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "role" TEXT NOT NULL,
  "tenant_scope" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "locked_at" TIMESTAMPTZ(3),
  "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  "published_at" TIMESTAMPTZ(3),
  "queue" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_audit_events_tenant_id_at_idx" ON "tenant_audit_events"("tenant_id", "at");
CREATE INDEX "mfa_challenges_email_expires_at_idx" ON "mfa_challenges"("email", "expires_at");
CREATE INDEX "service_admin_sessions_admin_email_revoked_at_idx" ON "service_admin_sessions"("admin_email", "revoked_at");
CREATE INDEX "outbox_events_status_queue_occurred_at_idx" ON "outbox_events"("status", "queue", "occurred_at");
