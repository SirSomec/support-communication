CREATE TABLE "platform_runtime_records" (
  "id" TEXT NOT NULL,
  "collection" TEXT NOT NULL,
  "entity_key" TEXT NOT NULL,
  "filter_key" TEXT,
  "record" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_runtime_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_runtime_records_collection_entity_key_key" UNIQUE ("collection", "entity_key")
);

CREATE INDEX "platform_runtime_records_collection_filter_updated_idx"
  ON "platform_runtime_records"("collection", "filter_key", "updated_at");

CREATE INDEX "platform_runtime_records_collection_updated_idx"
  ON "platform_runtime_records"("collection", "updated_at");
