CREATE TABLE "template_records" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL DEFAULT 'tenant-volga',
  "audit_id" TEXT,
  "channel" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "usage" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "template_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "template_records_tenant_scope_updated_at_idx" ON "template_records"("tenant_id", "scope", "updated_at");
CREATE INDEX "template_records_tenant_channel_topic_idx" ON "template_records"("tenant_id", "channel", "topic");
