import type { BillingProviderPort, BillingProviderSyncResult } from "./billing-provider.port.js";
import type { BillingInvoiceState, BillingSubscriptionState, BillingTenantState } from "./billing.repository.js";
export declare class SandboxBillingProvider implements BillingProviderPort {
    readonly providerName = "sandbox-billing-provider";
    syncTenantState(input: {
        eventType: string;
        idempotencyKey: string;
        invoice?: {
            invoice: Partial<BillingInvoiceState>;
            provider: string;
            subscription?: BillingSubscriptionState;
            tenant: BillingTenantState;
        };
        subscription?: {
            provider: string;
            subscription: Partial<BillingSubscriptionState>;
            tenant: BillingTenantState;
        };
        tenant: BillingTenantState;
    }): Promise<BillingProviderSyncResult>;
}
export declare function createBillingProvider(mode: string | undefined): BillingProviderPort;
