ALTER TABLE "conversations"
ADD COLUMN "operator_id" TEXT,
ADD COLUMN "operator_name" TEXT;

CREATE INDEX "conversations_tenant_operator_updated_at_idx"
ON "conversations"("tenant_id", "operator_id", "updated_at");
