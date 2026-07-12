ALTER TABLE "mcp_connectors"
ADD COLUMN "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
ADD CONSTRAINT "mcp_connectors_rate_limit_check" CHECK ("rate_limit_per_minute" BETWEEN 1 AND 300);
