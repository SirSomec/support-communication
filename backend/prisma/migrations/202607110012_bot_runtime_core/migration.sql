ALTER TABLE "bot_scenarios" ADD COLUMN "active_version_id" TEXT;

CREATE TABLE "bot_runtime_instances" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "scenario_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "current_node_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "context" JSONB NOT NULL DEFAULT '{}',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_runtime_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_runtime_instances_version_fkey" FOREIGN KEY ("tenant_id", "scenario_id", "version_id") REFERENCES "bot_scenario_versions"("tenant_id", "scenario_id", "version_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bot_runtime_instances_tenant_conversation_key" ON "bot_runtime_instances"("tenant_id", "conversation_id");
CREATE INDEX "bot_runtime_instances_tenant_status_retry_idx" ON "bot_runtime_instances"("tenant_id", "status", "next_attempt_at");

CREATE TABLE "bot_runtime_step_journal" (
  "id" TEXT NOT NULL,
  "runtime_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "input_event_id" TEXT NOT NULL,
  "input_event" JSONB NOT NULL,
  "node_id" TEXT NOT NULL,
  "node_type" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "error" TEXT,
  "webhook_response" JSONB,
  "handoff_summary" JSONB,
  "side_effects" JSONB NOT NULL DEFAULT '[]',
  "lifecycle_event" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_runtime_step_journal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_runtime_step_journal_runtime_fkey" FOREIGN KEY ("runtime_id") REFERENCES "bot_runtime_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bot_runtime_steps_tenant_conversation_event_key" ON "bot_runtime_step_journal"("tenant_id", "conversation_id", "input_event_id");
CREATE INDEX "bot_runtime_steps_runtime_created_idx" ON "bot_runtime_step_journal"("runtime_id", "created_at");

CREATE TABLE "bot_runtime_side_effects" (
  "id" TEXT NOT NULL,
  "step_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3),
  "lease_until" TIMESTAMPTZ(3),
  "last_error" TEXT,
  "delivered_at" TIMESTAMPTZ(3),
  "dead_lettered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bot_runtime_side_effects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bot_runtime_side_effects_step_fkey" FOREIGN KEY ("step_id") REFERENCES "bot_runtime_step_journal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "bot_runtime_side_effects_step_id_key" ON "bot_runtime_side_effects"("step_id", "id");
CREATE INDEX "bot_runtime_side_effects_reconcile_idx" ON "bot_runtime_side_effects"("status", "next_attempt_at", "lease_until");
CREATE INDEX "bot_runtime_side_effects_tenant_conversation_idx" ON "bot_runtime_side_effects"("tenant_id", "conversation_id", "created_at");
