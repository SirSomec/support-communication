CREATE TABLE "report_query_executions" (
    "id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "parameters" JSONB,
    "status" TEXT NOT NULL,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_query_executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_query_executions_metric_status_created_idx" ON "report_query_executions"("metric_key", "status", "created_at");

CREATE TABLE "report_file_descriptors" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "metric_definition_version" TEXT NOT NULL,
    "written_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_file_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_file_descriptors_job_id_key" ON "report_file_descriptors"("job_id");
CREATE INDEX "report_file_descriptors_tenant_created_idx" ON "report_file_descriptors"("tenant_id", "created_at");

CREATE TABLE "report_notification_descriptors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "export_job_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_notification_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_notification_descriptors_idempotency_key_key" ON "report_notification_descriptors"("idempotency_key");
CREATE INDEX "report_notification_descriptors_tenant_status_created_idx" ON "report_notification_descriptors"("tenant_id", "status", "created_at");
CREATE INDEX "report_notification_descriptors_export_job_idx" ON "report_notification_descriptors"("export_job_id");

CREATE TABLE "scheduled_digest_descriptors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scheduled_digest_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_digest_descriptors_tenant_schedule_period_key" ON "scheduled_digest_descriptors"("tenant_id", "schedule_id", "period_key");
CREATE INDEX "scheduled_digest_descriptors_tenant_status_due_idx" ON "scheduled_digest_descriptors"("tenant_id", "status", "due_at");

CREATE TABLE "report_export_retry_audit_events" (
    "audit_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "backend_queue_id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "immutable" BOOLEAN NOT NULL,
    "job_id" TEXT NOT NULL,
    "metric_definition_version" TEXT NOT NULL,
    "next_status_key" TEXT NOT NULL,
    "previous_status_key" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_export_retry_audit_events_pkey" PRIMARY KEY ("audit_id")
);

CREATE INDEX "report_export_retry_audit_events_job_at_idx" ON "report_export_retry_audit_events"("job_id", "at");
