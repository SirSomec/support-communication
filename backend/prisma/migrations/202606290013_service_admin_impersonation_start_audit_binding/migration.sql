ALTER TABLE "service_admin_impersonations" ADD COLUMN "audit_event_id" TEXT;

CREATE INDEX "service_admin_impersonations_audit_event_id_idx" ON "service_admin_impersonations"("audit_event_id");
