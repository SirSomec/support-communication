UPDATE "conversation_outbound_descriptors" AS descriptor
SET "status" = 'delivered',
    "delivery_state" = 'delivered',
    "retryable" = false,
    "updated_at" = COALESCE(outbox."published_at", NOW())
FROM "outbox_events" AS outbox
WHERE outbox."status" = 'published'
  AND outbox."payload" ->> 'descriptorId' = descriptor."id"
  AND descriptor."kind" IN ('message_delivery', 'outbound_conversation')
  AND (descriptor."status" <> 'delivered' OR descriptor."delivery_state" <> 'delivered');
