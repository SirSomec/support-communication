CREATE TABLE "proactive_execution_windows" (
  "window_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "rule_id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "starts_at" TEXT NOT NULL,
  "ends_at" TEXT NOT NULL,
  "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "proactive_execution_windows_pkey" PRIMARY KEY ("window_id")
);

CREATE UNIQUE INDEX "proactive_execution_windows_tenant_rule_window_key" ON "proactive_execution_windows"("tenant_id", "rule_id", "window_id");

CREATE INDEX "proactive_execution_windows_tenant_rule_active_idx" ON "proactive_execution_windows"("tenant_id", "rule_id", "active");

CREATE INDEX "proactive_execution_windows_tenant_active_idx" ON "proactive_execution_windows"("tenant_id", "active");
