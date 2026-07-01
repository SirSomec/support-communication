CREATE TABLE "public_api_keys" (
  "key_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "environment" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "key_preview" TEXT NOT NULL,
  "secret_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "public_api_keys_pkey" PRIMARY KEY ("key_id"),
  CONSTRAINT "public_api_keys_environment_check" CHECK ("environment" IN ('production', 'stage')),
  CONSTRAINT "public_api_keys_status_check" CHECK ("status" IN ('active', 'revoked'))
);

CREATE UNIQUE INDEX "public_api_keys_secret_hash_key" ON "public_api_keys"("secret_hash");
CREATE INDEX "public_api_keys_tenant_environment_status_idx" ON "public_api_keys"("tenant_id", "environment", "status");
CREATE INDEX "public_api_keys_tenant_key_idx" ON "public_api_keys"("tenant_id", "key_id");
