CREATE TABLE "client_merge_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "primary_profile_id" TEXT NOT NULL,
  "candidate_profile_id" TEXT,
  "detached_profile_id" TEXT,
  "merge_graph_edge" TEXT NOT NULL,
  "immutable" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "client_merge_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_merge_events_tenant_primary_idx" ON "client_merge_events"("tenant_id", "primary_profile_id");
CREATE INDEX "client_merge_events_tenant_candidate_idx" ON "client_merge_events"("tenant_id", "candidate_profile_id");
CREATE INDEX "client_merge_events_tenant_detached_idx" ON "client_merge_events"("tenant_id", "detached_profile_id");
