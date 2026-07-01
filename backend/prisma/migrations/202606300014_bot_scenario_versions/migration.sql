CREATE TABLE "bot_scenario_versions" (
  "version_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "runtime_version" TEXT,
  "status" TEXT NOT NULL,
  "flow_nodes" JSONB NOT NULL,
  "flow_edges" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_scenario_versions_pkey" PRIMARY KEY ("version_id"),
  CONSTRAINT "bot_scenario_versions_status_check" CHECK ("status" IN ('draft', 'published', 'retired')),
  CONSTRAINT "bot_scenario_versions_scenario_fkey" FOREIGN KEY ("tenant_id", "scenario_id") REFERENCES "bot_scenarios"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bot_scenario_versions_tenant_scenario_version_key" ON "bot_scenario_versions"("tenant_id", "scenario_id", "version_id");

CREATE INDEX "bot_scenario_versions_tenant_scenario_status_idx" ON "bot_scenario_versions"("tenant_id", "scenario_id", "status");

CREATE INDEX "bot_scenario_versions_tenant_created_at_idx" ON "bot_scenario_versions"("tenant_id", "created_at");
