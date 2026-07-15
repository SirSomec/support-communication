-- Webhook endpoints move from the in-memory slice to Postgres (prisma-only
-- runtime plan 2026-07-15, phase A2). These tenant-workspace webhook endpoint
-- records lived only in the integration store — even under
-- INTEGRATION_REPOSITORY=prisma they were held in an InMemoryStore and did not
-- survive a restart. Soft-deletion is a "deleted" flag (a tombstone that hides
-- a seed endpoint from the workspace read side).
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "retries" TEXT NOT NULL,
    "failure_rate" TEXT NOT NULL,
    "last_delivery" TEXT NOT NULL,
    "custom" BOOLEAN NOT NULL DEFAULT true,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);
