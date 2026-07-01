CREATE UNIQUE INDEX "metric_versions_id_tenant_key" ON "metric_versions"("id", "tenant_id");

CREATE TABLE "metric_tenant_overrides" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "definition_id" TEXT NOT NULL,
  "metric_version_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_tenant_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metric_tenant_overrides_definition_id_tenant_id_fkey" FOREIGN KEY ("definition_id", "tenant_id") REFERENCES "metric_definitions"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "metric_tenant_overrides_metric_version_id_tenant_id_fkey" FOREIGN KEY ("metric_version_id", "tenant_id") REFERENCES "metric_versions"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "metric_tenant_overrides_tenant_definition_key" ON "metric_tenant_overrides"("tenant_id", "definition_id");
CREATE INDEX "metric_tenant_overrides_tenant_version_idx" ON "metric_tenant_overrides"("tenant_id", "metric_version_id");
