CREATE TABLE "current_shifts" (
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "starts_at" TIMESTAMPTZ(3) NOT NULL,
  "ends_at" TIMESTAMPTZ(3) NOT NULL,
  "operator_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "current_shifts_pkey" PRIMARY KEY ("tenant_id"),
  CONSTRAINT "current_shifts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "current_shifts_time_range_check" CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "current_shifts_time_range_idx"
  ON "current_shifts"("starts_at", "ends_at");
