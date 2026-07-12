import type {
  BillingInvoiceState,
  BillingSubscriptionState,
  BillingSyncJob,
  BillingTenantState
} from "./billing.repository.js";

export interface BillingProviderCustomer {
  provider: string;
  providerCustomerId: string;
  tenantId: string;
}

export interface BillingProviderSubscriptionSyncInput {
  provider: string;
  subscription: Partial<BillingSubscriptionState>;
  tenant: BillingTenantState;
}

export interface BillingProviderInvoiceSyncInput {
  invoice: Partial<BillingInvoiceState>;
  provider: string;
  subscription?: BillingSubscriptionState;
  tenant: BillingTenantState;
}

export interface BillingProviderSyncResult {
  customer?: BillingProviderCustomer;
  invoice?: BillingInvoiceState;
  provider: string;
  subscription?: BillingSubscriptionState;
  syncJob: BillingSyncJob;
}

export interface BillingProviderPort {
  readonly providerName: string;
  syncTenantState(input: {
    eventType: string;
    idempotencyKey: string;
    invoice?: BillingProviderInvoiceSyncInput;
    subscription?: BillingProviderSubscriptionSyncInput;
    tenant: BillingTenantState;
  }): Promise<BillingProviderSyncResult>;
}

export interface BillingProviderFactoryOptions {
  mode?: string;
}

export function resolveBillingProviderMode(source: NodeJS.ProcessEnv = process.env): "sandbox" | "production" {
  const mode = String(source.BILLING_PROVIDER_MODE ?? "sandbox").trim().toLowerCase();
  return mode === "production" ? "production" : "sandbox";
}
