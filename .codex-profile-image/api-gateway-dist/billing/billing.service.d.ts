import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import { BillingRepository, type BillingInvoiceState, type BillingSubscriptionState } from "./billing.repository.js";
interface TariffChangePayload {
    actor?: ServiceAdminActor;
    approvalId?: string;
    confirmationText?: string;
    confirmed?: boolean;
    nextPlanId?: string;
    reason?: string;
    tenantId?: string;
}
interface QuotaCheckPayload {
    idempotencyKey?: string;
    mode?: string;
    requested?: unknown;
    resource?: string;
    tenantId?: string;
}
interface QuotaReservationPayload {
    idempotencyKey?: string;
    requested?: unknown;
    resource?: string;
    tenantId?: string;
}
interface QuotaReservationTransitionPayload {
    idempotencyKey?: string;
    reservationId?: string;
}
interface ProviderSyncPayload {
    actor?: ServiceAdminActor;
    approvalId?: string;
    eventType?: string;
    idempotencyKey?: string;
    invoice?: Partial<BillingInvoiceState>;
    provider?: string;
    subscription?: Partial<BillingSubscriptionState>;
    tenantId?: string;
}
export declare class BillingService {
    private readonly billingRepository;
    constructor(billingRepository?: BillingRepository);
    fetchTariffs(): Promise<BackendEnvelope<Record<string, unknown>>>;
    previewTariffChange(payload: TariffChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    changeTenantTariff(payload: TariffChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    checkQuota(payload: QuotaCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    reserveQuota(payload: QuotaReservationPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    commitQuotaReservation(payload: QuotaReservationTransitionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    releaseQuotaReservation(payload: QuotaReservationTransitionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTenantQuotaSnapshot(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTenantSubscription(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTenantInvoices(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    syncProviderBillingState(payload: ProviderSyncPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private validateTariffApproval;
    private validatePaymentActionApproval;
    private findTariff;
    private findTenant;
    private activeReservedAmount;
    private recordQuotaLedgerDecision;
}
export {};
