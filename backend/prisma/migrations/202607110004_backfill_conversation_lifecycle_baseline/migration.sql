INSERT INTO "conversation_lifecycle_events" (
  "id", "tenant_id", "conversation_id", "event_type", "occurred_at", "ingested_at",
  "actor_type", "source", "source_event_id", "trace_id", "schema_version", "data"
)
SELECT
  'backfill_conversation_created_' || c."id",
  c."tenant_id",
  c."id",
  'conversation.created',
  c."created_at",
  CURRENT_TIMESTAMP,
  'system',
  'migration.backfill',
  'conversation.created:' || c."id",
  'migration_202607110004',
  'conversation-lifecycle/v1',
  jsonb_build_object('backfilled', true, 'channel', c."channel")
FROM "conversations" c
ON CONFLICT DO NOTHING;

INSERT INTO "conversation_lifecycle_events" (
  "id", "tenant_id", "conversation_id", "event_type", "occurred_at", "ingested_at",
  "actor_type", "actor_name", "source", "source_event_id", "trace_id", "schema_version", "data"
)
SELECT
  'backfill_message_' || m."id",
  c."tenant_id",
  c."id",
  CASE
    WHEN m."type" = 'internal' THEN 'internal_comment.created'
    WHEN m."side" = 'client' THEN 'message.received'
    WHEN m."side" = 'agent' THEN 'message.sent'
  END,
  m."created_at",
  CURRENT_TIMESTAMP,
  CASE WHEN m."type" = 'internal' OR m."side" = 'agent' THEN 'operator' ELSE 'customer' END,
  m."author",
  'migration.backfill',
  'message:' || m."id",
  'migration_202607110004',
  'conversation-lifecycle/v1',
  jsonb_build_object('backfilled', true, 'messageId', m."id")
FROM "conversation_messages" m
JOIN "conversations" c ON c."id" = m."conversation_id"
WHERE m."type" = 'internal' OR m."side" IN ('client', 'agent')
ON CONFLICT DO NOTHING;
