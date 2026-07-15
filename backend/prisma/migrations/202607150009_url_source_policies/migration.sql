-- Tenant URL-ingestion allowlist moves from the JSON store to Postgres
-- (prisma-only runtime plan 2026-07-15, phase A3). The exact-host policy
-- previously lived in .runtime/url-source-policies.json with no table; without
-- it a tenant's remote-URL restrictions are silently lost on restart. A NULL
-- "allowed_hosts" means the tenant has not restricted hosts (any safe public
-- HTTPS host is allowed); an empty JSON array denies every host.
CREATE TABLE "url_source_policies" (
    "tenant_id" TEXT NOT NULL,
    "allowed_hosts" JSONB,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "url_source_policies_pkey" PRIMARY KEY ("tenant_id")
);
