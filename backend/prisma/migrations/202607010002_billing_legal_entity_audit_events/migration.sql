ALTER TABLE "billing_legal_entities"
  ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
