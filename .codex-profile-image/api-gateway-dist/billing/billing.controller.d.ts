import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type BillingInvoiceState, type BillingSubscriptionState } from "./billing.repository.js";
import { BillingService } from "./billing.service.js";
interface TariffChangeBody {
    approvalId?: string;
    confirmationText?: string;
    confirmed?: boolean;
    nextPlanId?: string;
    reason?: string;
    tenantId?: string;
}
interface QuotaCheckBody {
    idempotencyKey?: string;
    mode?: string;
    requested?: unknown;
    resource?: string;
    tenantId?: string;
}
interface QuotaReservationBody {
    idempotencyKey?: string;
    requested?: unknown;
    resource?: string;
    tenantId?: string;
}
interface QuotaReservationTransitionBody {
    idempotencyKey?: string;
}
interface ProviderSyncBody {
    approvalId?: string;
    eventType?: string;
    idempotencyKey?: string;
    invoice?: Partial<BillingInvoiceState>;
    provider?: string;
    subscription?: Partial<BillingSubscriptionState>;
    tenantId?: string;
}
export declare class BillingController {
    private readonly billingService;
    constructor(billingService: BillingService);
    fetchTariffs(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    previewTariffChange(payload: TariffChangeBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    previewTenantTariffChange(tenantId: string, payload: TariffChangeBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    changeTenantTariff(tenantId: string, payload: TariffChangeBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    patchTenantTariff(tenantId: string, payload: TariffChangeBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchTenantSubscription(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchTenantInvoices(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    syncProviderBillingState(payload: ProviderSyncBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    checkQuota(payload: QuotaCheckBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    reserveQuota(payload: QuotaReservationBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    commitQuotaReservation(reservationId: string, payload: QuotaReservationTransitionBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    releaseQuotaReservation(reservationId: string, payload: QuotaReservationTransitionBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export declare class PublicBillingCatalogController {
    private readonly billingService;
    constructor(billingService: BillingService);
    fetchTariffs(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export declare class QuotaController {
    private readonly billingService;
    constructor(billingService: BillingService);
    fetchTenantQuotaSnapshot(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    checkQuota(payload: QuotaCheckBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
