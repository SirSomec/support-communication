-- CreateTable
CREATE TABLE "billing_tenant_states" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "users" INTEGER NOT NULL,
    "workspaces" INTEGER NOT NULL,
    "monthly_revenue" INTEGER NOT NULL,
    "arr" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "health_score" INTEGER NOT NULL,
    "sla" TEXT NOT NULL,
    "usage" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_tenant_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_sync_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "from_plan_id" TEXT NOT NULL,
    "to_plan_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_name" TEXT NOT NULL,
    "audit_event_id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_tenant_states_plan_id_idx" ON "billing_tenant_states"("plan_id");

-- CreateIndex
CREATE INDEX "billing_sync_jobs_tenant_id_created_at_idx" ON "billing_sync_jobs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "billing_sync_jobs_status_queue_created_at_idx" ON "billing_sync_jobs"("status", "queue", "created_at");

-- AddForeignKey
ALTER TABLE "billing_sync_jobs" ADD CONSTRAINT "billing_sync_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
