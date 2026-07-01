ALTER TABLE "service_admin_impersonations" ADD COLUMN "approval_id" TEXT;

CREATE INDEX "service_admin_impersonations_approval_id_idx" ON "service_admin_impersonations"("approval_id");
