import type { BillingTariff } from "./billing.types.js";

export const billingTariffCatalog: BillingTariff[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 39000,
    includedUsers: 3,
    workspaceLimit: 3,
    webhookLimit: 20000,
    storageGb: 50,
    retentionDays: 30,
    automationRuns: 5000,
    aiTokens: 250000,
    botRuns: 2500,
    reportExports: 25,
    features: ["shared-inbox", "basic-analytics", "email-support"],
    changePolicy: "manager_confirmation_required"
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 129000,
    includedUsers: 15,
    workspaceLimit: 10,
    webhookLimit: 150000,
    storageGb: 300,
    retentionDays: 180,
    automationRuns: 50000,
    aiTokens: 2000000,
    botRuns: 25000,
    reportExports: 250,
    features: ["omnichannel", "routing", "sla", "exports"],
    changePolicy: "manager_confirmation_required"
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 380000,
    includedUsers: 35,
    workspaceLimit: 20,
    webhookLimit: 600000,
    storageGb: 1000,
    retentionDays: 365,
    automationRuns: 250000,
    aiTokens: 7000000,
    botRuns: 120000,
    reportExports: 1000,
    features: ["advanced-automation", "quality-ai", "custom-integrations"],
    changePolicy: "manager_confirmation_required"
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 990000,
    includedUsers: 70,
    workspaceLimit: 40,
    webhookLimit: 2500000,
    storageGb: 5000,
    retentionDays: 730,
    automationRuns: 1000000,
    aiTokens: 25000000,
    botRuns: 500000,
    reportExports: 5000,
    features: ["sso", "dedicated-success", "data-residency", "custom-sla"],
    changePolicy: "dual_approval_required"
  }
];
