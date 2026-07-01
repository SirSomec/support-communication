CREATE TABLE "billing_legal_entities" (
  "tenant_id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "legal_name" TEXT NOT NULL,
  "registration_number" TEXT NOT NULL,
  "tax_id" TEXT NOT NULL,
  "vat_id" TEXT,
  "address_line_1" TEXT NOT NULL,
  "address_line_2" TEXT,
  "city" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "postal_code" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_legal_entities_pkey" PRIMARY KEY ("tenant_id", "legal_entity_id"),
  CONSTRAINT "billing_legal_entities_status_check" CHECK ("status" IN ('active', 'archived', 'pending_review'))
);

CREATE UNIQUE INDEX "billing_legal_entities_tenant_registration_number_key" ON "billing_legal_entities"("tenant_id", "registration_number");

CREATE INDEX "billing_legal_entities_tenant_status_updated_idx" ON "billing_legal_entities"("tenant_id", "status", "updated_at");

CREATE INDEX "billing_legal_entities_tenant_country_status_idx" ON "billing_legal_entities"("tenant_id", "country", "status");

CREATE INDEX "billing_legal_entities_tenant_legal_name_idx" ON "billing_legal_entities"("tenant_id", "legal_name");

ALTER TABLE "billing_legal_entities" ADD CONSTRAINT "billing_legal_entities_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
