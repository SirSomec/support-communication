CREATE TABLE "service_admin_impersonations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "tenant_name" TEXT NOT NULL,
  "user_id" TEXT,
  "user_name" TEXT,
  "mode" TEXT NOT NULL,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "banner" TEXT NOT NULL,
  "stopped_at" TIMESTAMPTZ(3),
  "stop_audit_event" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "service_admin_impersonations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "break_glass_approvals" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "tenant_id" TEXT,
  "user_id" TEXT,
  "audit_event_id" TEXT NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "break_glass_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_admin_impersonations_tenant_user_active_idx" ON "service_admin_impersonations"("tenant_id", "user_id", "stopped_at", "expires_at");
CREATE INDEX "break_glass_approvals_status_expires_at_idx" ON "break_glass_approvals"("status", "expires_at");
CREATE INDEX "break_glass_approvals_tenant_user_requested_at_idx" ON "break_glass_approvals"("tenant_id", "user_id", "requested_at");
