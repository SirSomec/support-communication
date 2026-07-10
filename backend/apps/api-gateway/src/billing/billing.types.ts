export interface BillingTariff {
  id: string;
  name: string;
  priceMonthly: number;
  includedUsers: number;
  workspaceLimit: number;
  webhookLimit: number;
  storageGb: number;
  retentionDays: number;
  automationRuns: number;
  aiTokens: number;
  botRuns: number;
  reportExports: number;
  features: string[];
  changePolicy: string;
}

export interface TenantBillingState {
  id: string;
  name: string;
  status: "active" | "trial" | "watch" | "restricted";
  planId: string;
  users: number;
  workspaces: number;
  monthlyRevenue: number;
  arr: number;
  region: string;
  owner: string;
  healthScore: number;
  sla: string;
  usage: {
    aiTokens: number;
    botRuns: number;
    channels: number;
    operators: number;
    reportExports: number;
    storageGb: number;
    webhooks: number;
  };
}

export interface BillingSubscription {
  billingPeriod: "monthly" | "annual";
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  currency: string;
  currentPeriodEnd: string;
  currentPeriodStart: string;
  id: string;
  planId: string;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  seats: number;
  status: "active" | "trialing" | "past_due" | "canceled" | "paused";
  tenantId: string;
  unitAmountMonthly: number;
  updatedAt: string;
}

export interface BillingInvoice {
  amountDue: number;
  amountPaid: number;
  createdAt: string;
  currency: string;
  dueAt: string;
  hostedInvoiceUrl: string | null;
  id: string;
  paidAt: string | null;
  paymentStatus: "pending" | "succeeded" | "failed" | "refunded" | "none";
  provider: string;
  providerInvoiceId: string;
  status: "draft" | "open" | "paid" | "past_due" | "void" | "uncollectible";
  subscriptionId: string | null;
  tenantId: string;
  updatedAt: string;
}
