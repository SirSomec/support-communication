CREATE TABLE "routing_jobs" (
  "id" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "action" TEXT,
  "kind" TEXT,
  "status" TEXT,
  "conversation_id" TEXT,
  "redistribution_id" TEXT,
  "run_at" JSONB,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "routing_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "routing_jobs_queue_status_updated_idx"
  ON "routing_jobs" ("queue", "status", "updated_at");

CREATE INDEX "routing_jobs_queue_updated_idx"
  ON "routing_jobs" ("queue", "updated_at");

CREATE INDEX "routing_jobs_conversation_idx"
  ON "routing_jobs" ("conversation_id");
