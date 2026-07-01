-- CreateTable
CREATE TABLE "tenant_users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mfa_status" TEXT NOT NULL,
    "invite_status" TEXT NOT NULL,
    "last_active_at" TIMESTAMPTZ(3),
    "active_sessions" INTEGER NOT NULL DEFAULT 0,
    "risk" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "support_notes" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "actions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "group_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_admin_audit_events" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "result" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "tenant_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenant_id_email_key" ON "tenant_users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "tenant_users_tenant_id_status_idx" ON "tenant_users"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_users_email_idx" ON "tenant_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "permission_roles_key_key" ON "permission_roles"("key");

-- CreateIndex
CREATE INDEX "service_admin_audit_events_user_id_at_idx" ON "service_admin_audit_events"("user_id", "at");

-- CreateIndex
CREATE INDEX "service_admin_audit_events_tenant_id_at_idx" ON "service_admin_audit_events"("tenant_id", "at");

-- CreateIndex
CREATE INDEX "service_admin_audit_events_action_at_idx" ON "service_admin_audit_events"("action", "at");

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
