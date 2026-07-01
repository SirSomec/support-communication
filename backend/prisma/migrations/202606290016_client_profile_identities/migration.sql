CREATE TABLE "client_profiles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "source_profile_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "entry" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "client_since" TEXT NOT NULL,
  "previous" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_profiles_tenant_source_profile_key" ON "client_profiles"("tenant_id", "source_profile_id");
CREATE INDEX "client_profiles_tenant_id_updated_at_idx" ON "client_profiles"("tenant_id", "updated_at");
CREATE INDEX "client_profiles_tenant_id_channel_idx" ON "client_profiles"("tenant_id", "channel");
