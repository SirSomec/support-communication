CREATE TABLE IF NOT EXISTS "routing_state_snapshots" (
  "id" TEXT PRIMARY KEY,
  "conversations" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "operators" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "queues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "rescue_report_rows" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routing_state_snapshots_version_positive_check" CHECK ("version" > 0)
);
