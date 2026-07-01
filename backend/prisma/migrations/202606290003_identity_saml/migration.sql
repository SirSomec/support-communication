CREATE TABLE "saml_provider_metadata" (
    "provider_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "sso_url" TEXT NOT NULL,
    "acs_url" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "certificate_fingerprint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_provider_metadata_pkey" PRIMARY KEY ("provider_id")
);

CREATE TABLE "saml_acs_request_descriptors" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "relay_state" TEXT NOT NULL,
    "acs_url" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_acs_request_descriptors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "saml_assertion_replays" (
    "provider_id" TEXT NOT NULL,
    "assertion_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "trace_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saml_assertion_replays_pkey" PRIMARY KEY ("provider_id", "assertion_id")
);

CREATE INDEX "saml_provider_metadata_tenant_enabled_idx" ON "saml_provider_metadata"("tenant_id", "enabled");

CREATE UNIQUE INDEX "saml_acs_request_descriptors_request_id_key" ON "saml_acs_request_descriptors"("request_id");

CREATE UNIQUE INDEX "saml_acs_request_descriptors_relay_state_key" ON "saml_acs_request_descriptors"("relay_state");

CREATE INDEX "saml_acs_request_descriptors_provider_requested_idx" ON "saml_acs_request_descriptors"("provider_id", "requested_at");

CREATE INDEX "saml_acs_request_descriptors_expiry_consumed_idx" ON "saml_acs_request_descriptors"("expires_at", "consumed_at");

CREATE INDEX "saml_assertion_replays_provider_received_idx" ON "saml_assertion_replays"("provider_id", "received_at");

CREATE INDEX "saml_assertion_replays_expires_at_idx" ON "saml_assertion_replays"("expires_at");

ALTER TABLE "saml_acs_request_descriptors"
  ADD CONSTRAINT "saml_acs_request_descriptors_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "saml_provider_metadata"("provider_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saml_assertion_replays"
  ADD CONSTRAINT "saml_assertion_replays_provider_id_fkey"
  FOREIGN KEY ("provider_id") REFERENCES "saml_provider_metadata"("provider_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
