CREATE TABLE "marketing_channel_restrictions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "blocked" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_channel_restrictions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketing_channel_restrictions_tenant_client_channel_key"
  ON "marketing_channel_restrictions"("tenant_id", "client_id", "channel");

CREATE INDEX "marketing_channel_restrictions_tenant_channel_blocked_idx"
  ON "marketing_channel_restrictions"("tenant_id", "channel", "blocked");
