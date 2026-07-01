CREATE TABLE "public_api_key_rotation_audit_events" (
  "audit_id" TEXT NOT NULL,
  "rotation_id" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "key_preview" TEXT NOT NULL,
  "at" TIMESTAMPTZ(3) NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_api_key_rotation_audit_events_pkey" PRIMARY KEY ("audit_id"),
  CONSTRAINT "public_api_key_rotation_audit_events_immutable_check" CHECK ("immutable" = true),
  CONSTRAINT "public_api_key_rotation_audit_events_environment_check" CHECK ("environment" IN ('production', 'stage')),
  CONSTRAINT "public_api_key_rotation_audit_events_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public_api_keys"("key_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "public_api_key_rotation_audit_events_key_at_idx" ON "public_api_key_rotation_audit_events"("key_id", "at");
CREATE INDEX "public_api_key_rotation_audit_events_rotation_idx" ON "public_api_key_rotation_audit_events"("rotation_id");
CREATE INDEX "public_api_key_rotation_audit_events_action_at_idx" ON "public_api_key_rotation_audit_events"("action", "at");
