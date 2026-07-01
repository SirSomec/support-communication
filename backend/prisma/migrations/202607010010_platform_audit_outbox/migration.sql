CREATE TABLE "platform_audit_rows" (
    "id" TEXT NOT NULL,
    "mutation_kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_audit_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_audit_rows_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "platform_audit_rows_mutation_kind_check" CHECK ("mutation_kind" IN ('incident', 'alert', 'rollout')),
    CONSTRAINT "platform_audit_rows_immutable_check" CHECK ("immutable" = true)
);

CREATE TABLE "platform_outbox_rows" (
    "id" TEXT NOT NULL,
    "mutation_kind" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_outbox_rows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_outbox_rows_idempotency_key_key" UNIQUE ("idempotency_key"),
    CONSTRAINT "platform_outbox_rows_mutation_kind_check" CHECK ("mutation_kind" IN ('incident', 'alert', 'rollout'))
);

CREATE INDEX "platform_audit_rows_mutation_created_idx" ON "platform_audit_rows"("mutation_kind", "created_at");
CREATE INDEX "platform_audit_rows_target_created_idx" ON "platform_audit_rows"("target", "created_at");
CREATE INDEX "platform_outbox_rows_mutation_created_idx" ON "platform_outbox_rows"("mutation_kind", "created_at");
CREATE INDEX "platform_outbox_rows_queue_status_created_idx" ON "platform_outbox_rows"("queue", "status", "created_at");
