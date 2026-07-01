CREATE TABLE "proactive_experiment_assignments" (
  "assignment_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "experiment_id" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "variant" TEXT NOT NULL,
  "assigned_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_experiment_assignments_pkey" PRIMARY KEY ("assignment_id")
);

CREATE UNIQUE INDEX "proactive_experiment_assignments_tenant_rule_subject_key" ON "proactive_experiment_assignments"("tenant_id", "rule_id", "subject_id");

CREATE INDEX "proactive_experiment_assignments_tenant_rule_variant_idx" ON "proactive_experiment_assignments"("tenant_id", "rule_id", "variant");

CREATE INDEX "proactive_experiment_assignments_tenant_subject_idx" ON "proactive_experiment_assignments"("tenant_id", "subject_id");
