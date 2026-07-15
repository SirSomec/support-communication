-- AI usage counters move from the JSON store to Postgres (prisma-only runtime
-- plan 2026-07-15, phase A2). Only the durable enforcement data lives here:
-- monthly token spend and the sliding rate-limit window. The concurrency gauge
-- (active in-flight requests) stays in process memory — it is live request
-- state that would leak on a crash and is meaningless across restarts.
CREATE TABLE "ai_usage_counters" (
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "used_tokens" INTEGER NOT NULL DEFAULT 0,
    "request_times" JSONB NOT NULL DEFAULT '[]',
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_counters_pkey" PRIMARY KEY ("tenant_id", "connection_id", "month")
);
