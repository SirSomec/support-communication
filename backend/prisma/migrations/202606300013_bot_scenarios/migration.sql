CREATE TABLE "bot_scenarios" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "flow_nodes" JSONB NOT NULL,
  "flow_edges" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_scenarios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_scenarios_status_check" CHECK ("status" IN ('draft', 'published', 'archived'))
);

CREATE INDEX "bot_scenarios_tenant_status_idx" ON "bot_scenarios"("tenant_id", "status");

CREATE UNIQUE INDEX "bot_scenarios_tenant_id_key" ON "bot_scenarios"("tenant_id", "id");

CREATE INDEX "bot_scenarios_tenant_updated_at_idx" ON "bot_scenarios"("tenant_id", "updated_at");
