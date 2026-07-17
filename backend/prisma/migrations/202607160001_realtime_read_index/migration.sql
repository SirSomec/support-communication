CREATE INDEX "conversation_realtime_events_tenant_occurred_event_idx"
  ON "conversation_realtime_events" ("tenant_id", "occurred_at", "event_id");
