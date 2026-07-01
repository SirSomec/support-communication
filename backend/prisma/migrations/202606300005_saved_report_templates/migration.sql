CREATE TABLE "saved_report_templates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "report_type" TEXT NOT NULL,
  "columns" TEXT[] NOT NULL,
  "filters" JSONB NOT NULL,
  "visibility_scope" TEXT NOT NULL,
  "visibility_roles" TEXT[] NOT NULL,
  "visibility_permissions" TEXT[] NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saved_report_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_report_templates_visibility_scope_check" CHECK ("visibility_scope" IN ('private', 'roles', 'permissions'))
);

CREATE INDEX "saved_report_templates_tenant_visibility_idx" ON "saved_report_templates"("tenant_id", "visibility_scope");
CREATE INDEX "saved_report_templates_tenant_owner_idx" ON "saved_report_templates"("tenant_id", "owner_user_id");
CREATE INDEX "saved_report_templates_tenant_report_type_idx" ON "saved_report_templates"("tenant_id", "report_type");
