import { readFileSync, writeFileSync } from "node:fs";

const seedTypeImports = [
  ["backend/scripts/seeds/billing.seed.ts", "import type { BillingInvoice, BillingSubscription, BillingTariff, TenantBillingState } from \"../../apps/api-gateway/src/billing/billing.types.ts\";\n\n"],
  ["backend/scripts/seeds/operations.seed.ts", "import type { BackupDrill, DeadLetterMessage, DeadLetterQueue, LoadTestScenario, MigrationCandidate, SecurityControl } from \"../../apps/api-gateway/src/operations/operations.types.ts\";\n\n"],
  ["backend/scripts/seeds/platform.seed.ts", "import type { FeatureFlag, PlatformComponent, PlatformIncident, PlatformTenant } from \"../../apps/api-gateway/src/platform/platform.types.ts\";\n\n"],
  ["backend/scripts/seeds/routing.seed.ts", "import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue } from \"../../apps/api-gateway/src/routing/routing.types.ts\";\n\n"],
  ["backend/scripts/seeds/reports.seed.ts", "import type { ReportExportJob } from \"../../apps/api-gateway/src/reports/report.types.ts\";\n\n"],
  ["backend/scripts/seeds/automation.seed.ts", "import type { BotScenario, ProactiveRule } from \"../../apps/api-gateway/src/automation/automation.types.ts\";\n\n"],
  ["backend/scripts/seeds/quality.seed.ts", "import type { QualityMetric } from \"../../apps/api-gateway/src/quality/quality.types.ts\";\n\n"],
  ["backend/scripts/seeds/integrations.seed.ts", "import type { ApiEnvironmentKey, ChannelDetail, SecuritySession, WebhookDelivery } from \"../../apps/api-gateway/src/integrations/integration.types.ts\";\n\n"]
];

for (const [path, header] of seedTypeImports) {
  const source = readFileSync(path, "utf8");
  if (!source.startsWith("import type")) {
    writeFileSync(path, header + source);
    console.log("typed", path);
  }
}
