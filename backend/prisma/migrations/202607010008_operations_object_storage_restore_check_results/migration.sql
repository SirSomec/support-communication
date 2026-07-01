CREATE TABLE "operations_object_storage_restore_check_results" (
  "id" TEXT NOT NULL,
  "drill_id" TEXT NOT NULL,
  "restore_check_id" TEXT NOT NULL,
  "artifact_id" TEXT NOT NULL,
  "check_kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "detail" JSONB NOT NULL,
  "verified_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_object_storage_restore_check_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operations_object_storage_restore_check_results_drill_kind_idx" ON "operations_object_storage_restore_check_results"("drill_id", "check_kind", "verified_at");

CREATE INDEX "ops_object_restore_artifact_kind_idx" ON "operations_object_storage_restore_check_results"("artifact_id", "check_kind");

CREATE INDEX "ops_object_restore_check_id_idx" ON "operations_object_storage_restore_check_results"("restore_check_id");
