CREATE TABLE "metric_definitions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "metric_definitions_tenant_key_key" ON "metric_definitions"("tenant_id", "key");
CREATE INDEX "metric_definitions_tenant_source_idx" ON "metric_definitions"("tenant_id", "source");
