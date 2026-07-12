ALTER TABLE "conversations"
ADD COLUMN "resolution_outcome" TEXT;

UPDATE "conversations"
SET "resolution_outcome" = 'legacy_unknown'
WHERE "status" = 'closed' AND "resolution_outcome" IS NULL;

ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_resolution_outcome_value_check"
CHECK (
  "resolution_outcome" IS NULL OR
  "resolution_outcome" IN ('resolved', 'resolved_with_followup', 'duplicate', 'cancelled', 'spam', 'unresolved', 'legacy_unknown')
),
ADD CONSTRAINT "conversations_closed_resolution_outcome_check"
CHECK ("status" <> 'closed' OR "resolution_outcome" IS NOT NULL);

CREATE INDEX "conversations_tenant_resolution_outcome_updated_idx"
ON "conversations"("tenant_id", "resolution_outcome", "updated_at");
