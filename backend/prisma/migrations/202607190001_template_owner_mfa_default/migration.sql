-- Личные шаблоны: владелец записи шаблона.
ALTER TABLE "template_records" ADD COLUMN "owner_id" TEXT;
CREATE INDEX "template_records_tenant_owner_idx" ON "template_records"("tenant_id", "owner_id");

-- MFA (одноразовый код на почту) включена для всех сотрудников по умолчанию:
-- legacy-значения «не настроена/отключена» приводим к включённому состоянию.
UPDATE "tenant_users" SET "mfa_status" = 'enabled' WHERE "mfa_status" IN ('not_configured', 'disabled');
