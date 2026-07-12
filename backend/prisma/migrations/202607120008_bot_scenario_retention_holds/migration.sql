ALTER TABLE "bot_scenarios"
  ADD COLUMN "retention_until" TIMESTAMPTZ(3),
  ADD COLUMN "legal_hold" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "legal_hold_at" TIMESTAMPTZ(3),
  ADD COLUMN "legal_hold_by" TEXT,
  ADD COLUMN "legal_hold_reason" TEXT,
  ADD COLUMN "audit_hold" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "audit_hold_at" TIMESTAMPTZ(3),
  ADD COLUMN "audit_hold_by" TEXT,
  ADD COLUMN "audit_hold_reason" TEXT;

CREATE INDEX "bot_scenarios_tenant_retention_idx"
  ON "bot_scenarios"("tenant_id", "status", "retention_until");

-- Contract: immutable rows in bot_publish_audit_events are retained evidence.
-- The existing ON DELETE RESTRICT foreign key is intentionally kept, so their
-- presence blocks a scenario purge even if a concurrent worker observes it
-- after the application-level preflight check.
