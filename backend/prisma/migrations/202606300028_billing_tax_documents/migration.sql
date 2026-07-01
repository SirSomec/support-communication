CREATE TABLE "billing_tax_documents" (
  "tenant_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "legal_entity_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "request_fingerprint" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "storage_locator" TEXT NOT NULL,
  "uploaded_by" TEXT NOT NULL,
  "uploaded_by_name" TEXT NOT NULL,
  "trace_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_tax_documents_pkey" PRIMARY KEY ("tenant_id", "document_id"),
  CONSTRAINT "billing_tax_documents_status_check" CHECK ("status" IN ('approved', 'archived', 'pending_review', 'rejected')),
  CONSTRAINT "billing_tax_documents_document_type_check" CHECK ("document_type" IN ('bank_statement', 'tax_residency_certificate', 'vat_certificate'))
);

CREATE UNIQUE INDEX "billing_tax_documents_tenant_request_fingerprint_key" ON "billing_tax_documents"("tenant_id", "request_fingerprint");

CREATE INDEX "billing_tax_docs_tenant_entity_status_updated_idx" ON "billing_tax_documents"("tenant_id", "legal_entity_id", "status", "updated_at");

CREATE INDEX "billing_tax_docs_tenant_type_status_idx" ON "billing_tax_documents"("tenant_id", "document_type", "status");

CREATE INDEX "billing_tax_docs_tenant_sha256_idx" ON "billing_tax_documents"("tenant_id", "sha256");

ALTER TABLE "billing_tax_documents" ADD CONSTRAINT "billing_tax_documents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_tax_documents" ADD CONSTRAINT "billing_tax_documents_legal_entity_fkey"
  FOREIGN KEY ("tenant_id", "legal_entity_id") REFERENCES "billing_legal_entities"("tenant_id", "legal_entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
