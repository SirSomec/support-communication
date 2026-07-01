CREATE TABLE "template_audit_events" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "timestamp" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "template_audit_events_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_records"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "template_audit_events_template_id_timestamp_idx" ON "template_audit_events"("template_id", "timestamp");
CREATE INDEX "template_audit_events_action_timestamp_idx" ON "template_audit_events"("action", "timestamp");
