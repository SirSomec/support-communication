CREATE TABLE "operator_presence_intervals" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "changed_by" TEXT,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "ended_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operator_presence_intervals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operator_presence_tenant_operator_started_idx"
  ON "operator_presence_intervals"("tenant_id", "operator_id", "started_at");
CREATE INDEX "operator_presence_tenant_open_idx"
  ON "operator_presence_intervals"("tenant_id", "ended_at");
CREATE INDEX "operator_presence_tenant_started_idx"
  ON "operator_presence_intervals"("tenant_id", "started_at");
