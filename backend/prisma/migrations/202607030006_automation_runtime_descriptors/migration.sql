CREATE TABLE "automation_publish_idempotency_keys" (
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_publish_idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "automation_bot_test_runs" (
    "test_run_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scenario_id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "cases" JSONB NOT NULL DEFAULT '[]',
    "queue" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "automation_bot_test_runs_pkey" PRIMARY KEY ("test_run_id")
);

CREATE TABLE "proactive_rules" (
    "id" TEXT NOT NULL,
    "active_variant" TEXT,
    "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cooldown" TEXT,
    "segment" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proactive_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proactive_delivery_attempts" (
    "attempt_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "descriptor_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proactive_delivery_attempts_pkey" PRIMARY KEY ("attempt_id")
);

CREATE TABLE "proactive_delivery_idempotency_keys" (
    "key" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proactive_delivery_idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "proactive_delivery_attributions" (
    "attribution_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "descriptor_id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "proactive_delivery_attributions_pkey" PRIMARY KEY ("attribution_id")
);

CREATE INDEX "automation_bot_test_runs_tenant_scenario_idx" ON "automation_bot_test_runs"("tenant_id", "scenario_id");
CREATE INDEX "automation_bot_test_runs_tenant_status_idx" ON "automation_bot_test_runs"("tenant_id", "status");
CREATE INDEX "proactive_rules_status_idx" ON "proactive_rules"("status");
CREATE INDEX "proactive_delivery_attempts_tenant_rule_attempted_idx" ON "proactive_delivery_attempts"("tenant_id", "rule_id", "attempted_at");
CREATE INDEX "proactive_delivery_attempts_tenant_subject_idx" ON "proactive_delivery_attempts"("tenant_id", "subject_id");
CREATE INDEX "proactive_delivery_attempts_tenant_status_idx" ON "proactive_delivery_attempts"("tenant_id", "status");
CREATE INDEX "proactive_delivery_idempotency_keys_tenant_rule_subject_idx" ON "proactive_delivery_idempotency_keys"("tenant_id", "rule_id", "subject_id");
CREATE INDEX "proactive_delivery_attributions_tenant_rule_assigned_idx" ON "proactive_delivery_attributions"("tenant_id", "rule_id", "assigned_at");
CREATE INDEX "proactive_delivery_attributions_tenant_subject_idx" ON "proactive_delivery_attributions"("tenant_id", "subject_id");
