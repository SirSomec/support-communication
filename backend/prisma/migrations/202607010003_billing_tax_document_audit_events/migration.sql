ALTER TABLE "billing_tax_documents"
  ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
