ALTER TABLE "conversations" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "template_records" ALTER COLUMN "tenant_id" DROP DEFAULT;
ALTER TABLE "knowledge_articles" ALTER COLUMN "tenant_id" DROP DEFAULT;
