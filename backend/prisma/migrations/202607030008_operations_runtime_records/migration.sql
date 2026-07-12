CREATE TABLE "operations_runtime_records" (
  "id" TEXT NOT NULL,
  "collection" TEXT NOT NULL,
  "entity_key" TEXT NOT NULL,
  "filter_key" TEXT,
  "record" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_runtime_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "operations_runtime_records_collection_entity_key_key"
  ON "operations_runtime_records" ("collection", "entity_key");

CREATE INDEX "operations_runtime_records_collection_filter_updated_idx"
  ON "operations_runtime_records" ("collection", "filter_key", "updated_at");

CREATE INDEX "operations_runtime_records_collection_updated_idx"
  ON "operations_runtime_records" ("collection", "updated_at");
