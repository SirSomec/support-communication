ALTER TABLE "billing_approvals"
  ADD COLUMN "audit_events" JSONB NOT NULL DEFAULT '[]'::jsonb;
