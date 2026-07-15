-- MCP connectors move from the JSON store to Postgres (prisma-only runtime
-- plan 2026-07-15, phase A1). The store records carried request metadata that
-- the original table never had.
ALTER TABLE "mcp_connectors"
ADD COLUMN "name" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "rejected_reason" TEXT,
ADD COLUMN "requested_by" TEXT;
