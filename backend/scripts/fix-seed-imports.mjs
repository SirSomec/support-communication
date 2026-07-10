import { readFileSync, writeFileSync } from "node:fs";

const fixes = [
  {
    file: "backend/apps/api-gateway/src/billing/billing.repository.ts",
    from: `import {
  billingInvoices,
  billingSubscriptions,
  billingTariffs,
  tenantBillingStates,
  type BillingInvoice,
  type BillingSubscription,
  type BillingTariff,
  type TenantBillingState
} from "./billing.types.js";`,
    to: `import type { BillingInvoice, BillingSubscription, BillingTariff, TenantBillingState } from "./billing.types.js";
import { billingInvoices, billingSubscriptions, billingTariffs, tenantBillingStates } from "./seed.js";`
  },
  {
    file: "backend/apps/api-gateway/src/identity/identity.repository.ts",
    from: `import { permissionRoles, serviceAdminSession, tenantAuditEvents, tenants, tenantUsers } from "./identity.types.js";`,
    to: `import { permissionRoles, serviceAdminSession, tenantAuditEvents, tenants, tenantUsers } from "./seed.js";`
  },
  {
    file: "backend/apps/api-gateway/src/operations/operations-readiness.service.ts",
    from: `} from "./operations.types.js";`,
    to: `} from "./seed.js";`
  },
  {
    file: "backend/apps/api-gateway/src/platform/platform-monitoring.service.ts",
    from: `import { platformComponents, platformIncidents, platformMetrics, platformTenants, type PlatformComponent, type PlatformIncident } from "./platform.types.js";`,
    to: `import type { PlatformComponent, PlatformIncident, PlatformMetric, PlatformTenant } from "./platform.types.js";`
  },
  {
    file: "backend/apps/api-gateway/src/quality/quality.service.ts",
    from: `import { aiCoachingQueue, aiEffectivenessMetrics, aiRealtimeChecks, aiSuggestions, knowledgeArticles, qualityMetrics } from "./quality.types.js";`,
    to: `import { QualityRepository } from "./quality.repository.js";`
  },
  {
    file: "backend/apps/api-gateway/src/conversation/conversation.repository.ts",
    search: /import \{([^}]+)\} from "\.\/conversation\.types\.js";/,
    replace: (match, imports) => {
      const parts = imports.split(",").map((p) => p.trim());
      const types = parts.filter((p) => p.startsWith("type "));
      const values = parts.filter((p) => !p.startsWith("type "));
      if (values.length === 0) return match;
      return `import { ${values.join(", ")} } from "./seed.js";\nimport { ${types.join(", ")} } from "./conversation.types.js";`;
    }
  }
];

for (const fix of fixes) {
  let source = readFileSync(fix.file, "utf8");
  if (fix.from && fix.to) {
    if (!source.includes(fix.from)) {
      console.warn("skip missing", fix.file);
      continue;
    }
    source = source.replace(fix.from, fix.to);
  }
  if (fix.search) {
    source = source.replace(fix.search, fix.replace);
  }
  writeFileSync(fix.file, source);
  console.log("fixed", fix.file);
}
