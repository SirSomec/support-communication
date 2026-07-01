-- CreateTable
CREATE TABLE "billing_quota_reservations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested" INTEGER NOT NULL,
    "used_before" INTEGER NOT NULL,
    "used_after" INTEGER,
    "limit" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "commit_idempotency_key" TEXT,
    "release_idempotency_key" TEXT,
    "request_fingerprint" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "committed_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_quota_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_quota_reservations_idempotency_key_key" ON "billing_quota_reservations"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "billing_quota_reservations_commit_idempotency_key_key" ON "billing_quota_reservations"("commit_idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "billing_quota_reservations_release_idempotency_key_key" ON "billing_quota_reservations"("release_idempotency_key");

-- CreateIndex
CREATE INDEX "billing_quota_res_tenant_resource_status_created_idx" ON "billing_quota_reservations"("tenant_id", "resource", "status", "created_at");

-- CreateIndex
CREATE INDEX "billing_quota_reservations_status_expires_at_idx" ON "billing_quota_reservations"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "billing_quota_reservations" ADD CONSTRAINT "billing_quota_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "billing_tenant_states"("id") ON DELETE CASCADE ON UPDATE CASCADE;
