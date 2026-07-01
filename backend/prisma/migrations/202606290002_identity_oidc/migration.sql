CREATE TABLE "oidc_provider_configs" (
  "provider_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "jwks_uri" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oidc_provider_configs_pkey" PRIMARY KEY ("provider_id")
);

CREATE INDEX "oidc_provider_configs_tenant_enabled_idx" ON "oidc_provider_configs"("tenant_id", "enabled");

CREATE TABLE "oidc_callback_descriptors" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "nonce_hash" TEXT NOT NULL,
  "redirect_uri" TEXT NOT NULL,
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "oidc_callback_descriptors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oidc_callback_descriptors_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "oidc_provider_configs"("provider_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "oidc_callback_descriptors_state_key" ON "oidc_callback_descriptors"("state");
CREATE INDEX "oidc_callback_descriptors_provider_requested_idx" ON "oidc_callback_descriptors"("provider_id", "requested_at");
CREATE INDEX "oidc_callback_descriptors_expiry_consumed_idx" ON "oidc_callback_descriptors"("expires_at", "consumed_at");
