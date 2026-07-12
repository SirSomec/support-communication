CREATE TABLE "mcp_connectors" (
 "id" TEXT NOT NULL, "tenant_id" TEXT NOT NULL, "endpoint" TEXT NOT NULL,
 "allowed_hosts" JSONB NOT NULL, "tools" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'disabled',
 "approved_at" TIMESTAMPTZ(3), "approved_by" TEXT, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "mcp_connectors_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "mcp_connectors_status_check" CHECK ("status" IN ('disabled','enabled'))
);
CREATE UNIQUE INDEX "mcp_connectors_tenant_id_id_key" ON "mcp_connectors"("tenant_id","id");
CREATE INDEX "mcp_connectors_tenant_status_idx" ON "mcp_connectors"("tenant_id","status");
