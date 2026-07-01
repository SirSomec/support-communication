CREATE TABLE "rbac_policy_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "activated_at" TIMESTAMPTZ(3),

    CONSTRAINT "rbac_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rbac_role_grants" (
    "id" TEXT NOT NULL,
    "policy_version_id" TEXT NOT NULL,
    "role_key" TEXT,
    "tenant_id" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "trace_id" TEXT NOT NULL,

    CONSTRAINT "rbac_role_grants_effect_check" CHECK ("effect" IN ('allow', 'deny')),
    CONSTRAINT "rbac_role_grants_policy_version_fk" FOREIGN KEY ("policy_version_id") REFERENCES "rbac_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rbac_role_grants_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "permission_roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rbac_role_grants_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rbac_role_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permission_denial_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "actor_id" TEXT,
    "role_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "policy_version_id" TEXT,
    "reason" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "trace_id" TEXT NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_denial_events_immutable_check" CHECK ("immutable" = true),
    CONSTRAINT "permission_denial_events_policy_version_fk" FOREIGN KEY ("policy_version_id") REFERENCES "rbac_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "permission_denial_events_role_key_fk" FOREIGN KEY ("role_key") REFERENCES "permission_roles"("key") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "permission_denial_events_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "permission_denial_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rbac_policy_versions_status_activated_at_idx" ON "rbac_policy_versions"("status", "activated_at");
CREATE UNIQUE INDEX "rbac_policy_versions_one_active_idx" ON "rbac_policy_versions"("status") WHERE "status" = 'active';
CREATE INDEX "rbac_role_grants_policy_tenant_role_action_idx" ON "rbac_role_grants"("policy_version_id", "tenant_id", "role_key", "action", "resource");
CREATE INDEX "rbac_role_grants_role_action_idx" ON "rbac_role_grants"("role_key", "action");
CREATE INDEX "permission_denial_events_tenant_action_at_idx" ON "permission_denial_events"("tenant_id", "action", "at");
CREATE INDEX "permission_denial_events_policy_at_idx" ON "permission_denial_events"("policy_version_id", "at");
