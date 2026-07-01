CREATE TABLE "client_merge_conflicts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "primary_profile_id" TEXT NOT NULL,
  "candidate_profile_id" TEXT NOT NULL,
  "conflicting_fields" TEXT[] NOT NULL,
  "reason" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_merge_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_merge_conflicts_tenant_state_idx" ON "client_merge_conflicts"("tenant_id", "state");
CREATE INDEX "client_merge_conflicts_tenant_primary_idx" ON "client_merge_conflicts"("tenant_id", "primary_profile_id");
