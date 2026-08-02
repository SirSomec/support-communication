export * from "./seed-catalog.js";
import { billingInvoices, billingSubscriptions, billingTariffs, tenantBillingStates } from "./seed-catalog.js";
import { BillingRepository } from "./billing.repository.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapBillingState(base) {
    return {
        billingApprovals: base?.billingApprovals ?? [],
        billingLegalEntities: base?.billingLegalEntities ?? [],
        billingProviderSyncEvents: base?.billingProviderSyncEvents ?? [],
        billingTaxDocuments: base?.billingTaxDocuments ?? [],
        billingSyncJobs: base?.billingSyncJobs ?? [],
        invoices: clone(billingInvoices),
        paymentDunningStates: base?.paymentDunningStates ?? [],
        paymentRetryKeys: base?.paymentRetryKeys ?? [],
        paymentRetrySchedules: base?.paymentRetrySchedules ?? [],
        quotaLedgerEntries: base?.quotaLedgerEntries ?? [],
        quotaReservations: base?.quotaReservations ?? [],
        reconciliationConflicts: base?.reconciliationConflicts ?? [],
        subscriptions: clone(billingSubscriptions),
        tariffs: clone(billingTariffs),
        tenants: clone(tenantBillingStates)
    };
}
export function createSeededBillingRepository(base) {
    return BillingRepository.inMemory(bootstrapBillingState(base));
}
//# sourceMappingURL=seed.js.map