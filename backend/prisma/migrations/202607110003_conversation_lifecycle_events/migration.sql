CREATE UNIQUE INDEX "conversations_tenant_id_id_key"
  ON "conversations"("tenant_id", "id");

CREATE TABLE "conversation_lifecycle_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "conversation_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "ingested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_type" TEXT NOT NULL,
  "actor_id" TEXT,
  "actor_name" TEXT,
  "source" TEXT NOT NULL,
  "source_event_id" TEXT NOT NULL,
  "reason" TEXT,
  "trace_id" TEXT NOT NULL,
  "schema_version" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  CONSTRAINT "conversation_lifecycle_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_lifecycle_events_conversation_fkey"
    FOREIGN KEY ("tenant_id", "conversation_id")
    REFERENCES "conversations"("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "conversation_lifecycle_events_source_key"
  ON "conversation_lifecycle_events"("tenant_id", "source", "source_event_id");
CREATE INDEX "conversation_lifecycle_events_tenant_conversation_idx"
  ON "conversation_lifecycle_events"("tenant_id", "conversation_id", "occurred_at", "id");
CREATE INDEX "conversation_lifecycle_events_tenant_type_idx"
  ON "conversation_lifecycle_events"("tenant_id", "event_type", "occurred_at");

CREATE FUNCTION reject_conversation_lifecycle_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'conversation_lifecycle_events are append-only';
END;
$$;

CREATE TRIGGER "conversation_lifecycle_events_append_only"
BEFORE UPDATE OR DELETE ON "conversation_lifecycle_events"
FOR EACH ROW EXECUTE FUNCTION reject_conversation_lifecycle_event_mutation();
