CREATE TABLE "ai_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider_type" TEXT NOT NULL,
  "base_url" TEXT NOT NULL,
  "chat_model" TEXT NOT NULL,
  "embedding_model" TEXT,
  "secret_ciphertext" TEXT,
  "secret_ref" TEXT,
  "key_version" TEXT,
  "capabilities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "limits" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'disabled',
  "last_tested_at" TIMESTAMPTZ(3),
  "last_test_status" TEXT,
  "last_test_message" TEXT,
  "disabled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_connections_tenant_id_key" ON "ai_connections" ("tenant_id", "id");
CREATE INDEX "ai_connections_tenant_status_idx" ON "ai_connections" ("tenant_id", "status");
