CREATE TABLE "workspace_topics" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "access_scope" TEXT NOT NULL,
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "branch_name" TEXT NOT NULL,
  "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "group_name" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "routing_target" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "workspace_topics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_topics_tenant_archived_sort_order_idx"
  ON "workspace_topics"("tenant_id", "archived", "sort_order");
