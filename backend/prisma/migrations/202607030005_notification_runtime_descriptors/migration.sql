CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "type_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "history" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_tenant_recipient_created_idx" ON "notifications"("tenant_id", "recipient_user_id", "created_at");
CREATE INDEX "notifications_tenant_read_created_idx" ON "notifications"("tenant_id", "read_at", "created_at");

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "browser_push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "browser_push_endpoint" TEXT,
    "browser_push_permission" TEXT,
    "browser_push_subscription_id" TEXT,
    "enabled_external_channel_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "muted_sound_rule_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "muted_type_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_preferences_tenant_user_idx" ON "notification_preferences"("tenant_id", "user_id");

CREATE TABLE "browser_push_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "endpoint_hash" TEXT NOT NULL,
    "expiration_time" INTEGER,
    "key_auth" TEXT NOT NULL,
    "key_p256dh" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "browser_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "browser_push_subscriptions_tenant_user_status_idx" ON "browser_push_subscriptions"("tenant_id", "user_id", "status");
CREATE INDEX "browser_push_subscriptions_tenant_endpoint_status_idx" ON "browser_push_subscriptions"("tenant_id", "endpoint_hash", "status");

CREATE TABLE "notification_delivery_descriptors" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "notification_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "endpoint_hash" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ(3),
    "failed_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMPTZ(3),
    "provider_message_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "notification_delivery_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_delivery_descriptors_tenant_status_created_idx" ON "notification_delivery_descriptors"("tenant_id", "status", "created_at");
CREATE INDEX "notification_delivery_descriptors_status_next_created_idx" ON "notification_delivery_descriptors"("status", "next_attempt_at", "created_at");
CREATE INDEX "notification_delivery_descriptors_subscription_idx" ON "notification_delivery_descriptors"("subscription_id");

CREATE TABLE "notification_preference_audit_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "immutable" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    CONSTRAINT "notification_preference_audit_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_preference_audit_events_immutable_check" CHECK ("immutable" = true)
);

CREATE INDEX "notification_preference_audit_events_tenant_at_idx" ON "notification_preference_audit_events"("tenant_id", "at");
