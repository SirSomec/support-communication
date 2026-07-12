CREATE TABLE "service_admin_audit_exports" (
  "id" TEXT NOT NULL,
  "descriptor_id" TEXT NOT NULL,
  "filters" JSONB NOT NULL DEFAULT '{}',
  "source_event_ids" JSONB NOT NULL DEFAULT '[]',
  "requester_id" TEXT NOT NULL,
  "requester_name" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "redaction_policy" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "descriptor" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_admin_audit_exports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_admin_audit_exports_requester_created_idx"
  ON "service_admin_audit_exports" ("requester_id", "created_at");

CREATE INDEX "service_admin_audit_exports_expires_at_idx"
  ON "service_admin_audit_exports" ("expires_at");

CREATE TABLE "service_admin_audit_redactions" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "overlay" JSONB NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_admin_audit_redactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "service_admin_audit_redactions_event_created_idx"
  ON "service_admin_audit_redactions" ("event_id", "created_at");
