CREATE UNIQUE INDEX "metric_definitions_id_tenant_key" ON "metric_definitions"("id", "tenant_id");

CREATE TABLE "metric_versions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "definition_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "query_key" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_versions_status_check" CHECK ("status" IN ('active', 'draft', 'retired')),
  CONSTRAINT "metric_versions_definition_id_tenant_id_fkey" FOREIGN KEY ("definition_id", "tenant_id") REFERENCES "metric_definitions"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "metric_versions_tenant_definition_version_key" ON "metric_versions"("tenant_id", "definition_id", "version");
CREATE INDEX "metric_versions_tenant_definition_status_idx" ON "metric_versions"("tenant_id", "definition_id", "status");
