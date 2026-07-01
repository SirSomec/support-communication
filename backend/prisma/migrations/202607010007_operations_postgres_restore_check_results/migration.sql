CREATE TABLE "operations_postgres_restore_check_results" (
  "id" TEXT NOT NULL,
  "drill_id" TEXT NOT NULL,
  "restore_check_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "output_summary" TEXT NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "executed_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "operations_postgres_restore_check_results_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "operations_postgres_restore_check_results_drill_executed_idx" ON "operations_postgres_restore_check_results"("drill_id", "executed_at");

CREATE INDEX "operations_postgres_restore_check_results_restore_check_id_idx" ON "operations_postgres_restore_check_results"("restore_check_id");
