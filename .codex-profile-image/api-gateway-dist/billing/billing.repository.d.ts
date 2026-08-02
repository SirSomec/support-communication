import type { BillingInvoice, BillingSubscription, BillingTariff, TenantBillingState } from "./billing.types.js";
export type BillingTenantState = TenantBillingState;
export type BillingInvoiceState = BillingInvoice;
export type BillingSubscriptionState = BillingSubscription;
export interface BillingSyncJob {
    actor: string;
    actorName: string;
    attempts: number;
    auditEventId: string;
    createdAt: string;
    deadLetteredAt: string | null;
    fromPlanId: string;
    id: string;
    lastError: string | null;
    lockedAt: string | null;
    nextAttemptAt: string | null;
    payload: Record<string, unknown>;
    publishedAt: string | null;
    queue: "billing-sync";
    reason: string;
    status: "dead_lettered" | "pending" | "publishing" | "published" | "failed";
    tenantId: string;
    toPlanId: string;
    traceId: string;
}
export interface BillingAuditEvent {
    action: string;
    actor: string;
    actorName: string;
    approvalId?: string | null;
    at: string;
    id: string;
    immutable: true;
    reason: string;
    result: string;
    severity: "critical" | "info" | "warning";
    target: string;
    tenantId: string;
    traceId: string;
}
export interface BillingQuotaLedgerEntry {
    auditEvent?: BillingAuditEvent;
    createdAt: string;
    decision: "allow" | "deny";
    id: string;
    idempotencyKey: string;
    limit: number;
    mode: "record";
    planId: string;
    projected: number;
    reason: string | null;
    remainingAfter: number;
    remainingBefore: number;
    requested: number;
    requestFingerprint: string;
    resource: string;
    tenantId: string;
    traceId: string;
    used: number;
}
export interface BillingQuotaReservation {
    auditEvent?: BillingAuditEvent;
    auditEvents?: BillingAuditEvent[];
    commitIdempotencyKey: string | null;
    committedAt: string | null;
    createdAt: string;
    expiresAt: string;
    id: string;
    idempotencyKey: string;
    limit: number;
    lockedAt?: string | null;
    planId: string;
    releaseIdempotencyKey: string | null;
    releasedAt: string | null;
    requested: number;
    requestFingerprint: string;
    resource: string;
    status: "reserved" | "committed" | "released" | "expired";
    tenantId: string;
    traceId: string;
    updatedAt: string;
    usedAfter: number | null;
    usedBefore: number;
}
export type BillingApprovalStatus = "approved" | "expired" | "pending" | "rejected";
export type BillingApprovalSubjectType = "payment_action" | "tariff_change";
export interface BillingApprovalDecisionAuditEvent {
    action: "billing.approval.decided";
    approvalId: string;
    at: string;
    decidedBy: string;
    decidedByName: string;
    decisionReason: string;
    immutable: true;
    result: "approved" | "rejected";
    subjectId: string;
    subjectType: BillingApprovalSubjectType;
    tenantId: string;
    traceId: string;
}
export interface BillingApproval {
    approvalId: string;
    auditEvents?: BillingApprovalDecisionAuditEvent[];
    createdAt: string;
    decidedAt: string | null;
    decidedBy: string | null;
    decidedByName: string | null;
    decisionReason: string | null;
    expiresAt: string;
    reason: string;
    requestedBy: string;
    requestedByName: string;
    requestFingerprint: string;
    status: BillingApprovalStatus;
    subjectId: string;
    subjectType: BillingApprovalSubjectType;
    tenantId: string;
    traceId: string;
    updatedAt: string;
}
export interface BillingApprovalListInput {
    statuses?: BillingApprovalStatus[];
    subjectType?: BillingApprovalSubjectType;
    tenantId?: string;
}
export interface BillingApprovalDecisionInput {
    approvalId: string;
    decidedAt: string;
    decidedBy: string;
    decidedByName: string;
    decisionReason: string;
    status: "approved" | "rejected";
    tenantId: string;
    traceId: string;
}
export type BillingLegalEntityStatus = "active" | "archived" | "pending_review";
export interface BillingLegalEntityAuditEvent {
    action: "billing.legal_entity.saved";
    at: string;
    immutable: true;
    legalEntityId: string;
    legalName: string;
    registrationNumber: string;
    result: BillingLegalEntityStatus;
    tenantId: string;
    traceId: string;
}
export interface BillingLegalEntity {
    addressLine1: string;
    addressLine2: string | null;
    auditEvents?: BillingLegalEntityAuditEvent[];
    city: string;
    country: string;
    createdAt: string;
    legalEntityId: string;
    legalName: string;
    postalCode: string;
    region: string;
    registrationNumber: string;
    status: BillingLegalEntityStatus;
    taxId: string;
    tenantId: string;
    traceId: string;
    updatedAt: string;
    vatId: string | null;
}
export interface BillingLegalEntityListInput {
    statuses?: BillingLegalEntityStatus[];
    tenantId?: string;
}
export type BillingTaxDocumentStatus = "approved" | "archived" | "pending_review" | "rejected";
export type BillingTaxDocumentType = "bank_statement" | "tax_residency_certificate" | "vat_certificate";
export interface BillingTaxDocumentAuditEvent {
    action: "billing.tax_document.saved";
    at: string;
    documentId: string;
    documentType: BillingTaxDocumentType;
    fileName: string;
    immutable: true;
    legalEntityId: string;
    result: BillingTaxDocumentStatus;
    tenantId: string;
    traceId: string;
    uploadedBy: string;
}
export interface BillingTaxDocument {
    auditEvents?: BillingTaxDocumentAuditEvent[];
    createdAt: string;
    documentId: string;
    documentType: BillingTaxDocumentType;
    fileName: string;
    legalEntityId: string;
    mimeType: string;
    requestFingerprint: string;
    sha256: string;
    status: BillingTaxDocumentStatus;
    storageLocator: string;
    tenantId: string;
    traceId: string;
    updatedAt: string;
    uploadedBy: string;
    uploadedByName: string;
}
export interface BillingTaxDocumentListInput {
    documentTypes?: BillingTaxDocumentType[];
    statuses?: BillingTaxDocumentStatus[];
    tenantId?: string;
}
export interface BillingProviderSyncEvent {
    auditEvents?: BillingProviderSyncAuditEvent[];
    createdAt: string;
    eventType: string;
    id: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    provider: string;
    requestFingerprint: string;
    status: "accepted" | "duplicate" | "failed";
    syncJobId: string;
    tenantId: string;
    traceId: string;
}
export interface BillingProviderSyncAuditEvent {
    action: "billing.provider_sync.accepted" | "billing.provider_sync.duplicate";
    at: string;
    eventId: string;
    eventType: string;
    id: string;
    idempotencyKey: string;
    immutable: true;
    provider: string;
    result: "accepted" | "duplicate";
    syncJobId: string;
    tenantId: string;
    traceId: string;
}
export type BillingPaymentRetryScheduleStatus = "canceled" | "exhausted" | "paid" | "scheduled";
export interface BillingPaymentRetrySchedule {
    attempt: number;
    createdAt: string;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: string | null;
    maxAttempts: number;
    nextAttemptAt: string;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    scheduleId: string;
    status: BillingPaymentRetryScheduleStatus;
    tenantId: string;
    traceId: string;
    updatedAt: string;
}
export interface BillingPaymentRetryScheduleListInput {
    invoiceId?: string;
    statuses?: BillingPaymentRetryScheduleStatus[];
    tenantId?: string;
}
export type BillingPaymentRetryKeyStatus = "claimed" | "failed" | "succeeded";
export interface BillingPaymentRetryKey {
    attempt: number;
    createdAt: string;
    firstAttemptAt: string;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: string | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    result: Record<string, unknown>;
    retryKeyId: string;
    scheduleId: string | null;
    status: BillingPaymentRetryKeyStatus;
    tenantId: string;
    traceId: string;
    updatedAt: string;
}
export interface BillingPaymentRetryKeyListInput {
    invoiceId?: string;
    statuses?: BillingPaymentRetryKeyStatus[];
    tenantId?: string;
}
export type BillingPaymentDunningStatus = "active" | "canceled" | "paid" | "paused";
export interface BillingPaymentDunningState {
    createdAt: string;
    dunningId: string;
    failedAttempts: number;
    idempotencyKey: string;
    invoiceId: string;
    lastFailureAt: string | null;
    nextActionAt: string | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    stage: "final_notice" | "grace" | "initial";
    status: BillingPaymentDunningStatus;
    subscriptionId: string | null;
    tenantId: string;
    traceId: string;
    updatedAt: string;
}
export interface BillingPaymentDunningStateListInput {
    invoiceId?: string;
    statuses?: BillingPaymentDunningStatus[];
    tenantId?: string;
}
export type BillingReconciliationConflictSeverity = "high" | "low" | "medium";
export type BillingReconciliationConflictStatus = "ignored" | "open" | "resolved";
export interface BillingReconciliationConflict {
    actual: Record<string, unknown>;
    conflictId: string;
    createdAt: string;
    detectedAt: string;
    expected: Record<string, unknown>;
    idempotencyKey: string;
    invoiceId: string;
    provider: string;
    providerInvoiceId: string;
    reason: string;
    requestFingerprint: string;
    resolution: string | null;
    resolvedAt: string | null;
    severity: BillingReconciliationConflictSeverity;
    status: BillingReconciliationConflictStatus;
    tenantId: string;
    traceId: string;
    updatedAt: string;
}
export interface BillingReconciliationConflictListInput {
    invoiceId?: string;
    severities?: BillingReconciliationConflictSeverity[];
    statuses?: BillingReconciliationConflictStatus[];
    tenantId?: string;
}
export interface BillingState {
    billingApprovals: BillingApproval[];
    billingLegalEntities: BillingLegalEntity[];
    billingProviderSyncEvents: BillingProviderSyncEvent[];
    billingTaxDocuments: BillingTaxDocument[];
    paymentDunningStates: BillingPaymentDunningState[];
    paymentRetryKeys: BillingPaymentRetryKey[];
    paymentRetrySchedules: BillingPaymentRetrySchedule[];
    reconciliationConflicts: BillingReconciliationConflict[];
    quotaReservations: BillingQuotaReservation[];
    quotaLedgerEntries: BillingQuotaLedgerEntry[];
    billingSyncJobs: BillingSyncJob[];
    invoices: BillingInvoiceState[];
    subscriptions: BillingSubscriptionState[];
    tariffs: BillingTariff[];
    tenants: BillingTenantState[];
}
type MaybePromise<T> = T | Promise<T>;
export interface BillingRepositoryPort {
    decideBillingApproval(input: BillingApprovalDecisionInput): MaybePromise<BillingApproval>;
    findBillingApproval(approvalId: string | undefined, tenantId?: string): MaybePromise<BillingApproval | undefined>;
    findBillingLegalEntity(legalEntityId: string | undefined, tenantId?: string): MaybePromise<BillingLegalEntity | undefined>;
    findBillingTaxDocument(documentId: string | undefined, tenantId?: string): MaybePromise<BillingTaxDocument | undefined>;
    applyProviderBillingSync(input: BillingProviderSyncInput): MaybePromise<{
        event: BillingProviderSyncEvent;
        invoice?: BillingInvoiceState;
        paymentDunningState?: BillingPaymentDunningState;
        paymentRetryKey?: BillingPaymentRetryKey;
        paymentRetrySchedule?: BillingPaymentRetrySchedule;
        reconciliationConflict?: BillingReconciliationConflict;
        subscription?: BillingSubscriptionState;
        syncJob: BillingSyncJob;
        tenant: BillingTenantState;
    }>;
    appendProviderSyncAuditEvent(idempotencyKey: string, auditEvent: BillingProviderSyncAuditEvent): MaybePromise<BillingProviderSyncEvent | undefined>;
    claimExpiredQuotaReservations(input?: BillingQuotaReservationClaimInput): MaybePromise<BillingQuotaReservation[]>;
    commitQuotaReservation(input: BillingQuotaReservationCommitInput): MaybePromise<{
        reservation: BillingQuotaReservation;
        tenant: BillingTenantState;
    }>;
    createQuotaReservation(reservation: BillingQuotaReservation): MaybePromise<BillingQuotaReservation>;
    reserveQuotaAtomically(input: BillingQuotaReservationAtomicInput): MaybePromise<BillingQuotaReservationAtomicResult>;
    applyTenantTariffChange(input: BillingTariffChangeInput): MaybePromise<{
        syncJob: BillingSyncJob;
        tenant: BillingTenantState;
    }>;
    findProviderSyncEventByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingProviderSyncEvent | undefined>;
    findPaymentRetryScheduleByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentRetrySchedule | undefined>;
    findPaymentRetryKeyByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentRetryKey | undefined>;
    findPaymentDunningStateByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentDunningState | undefined>;
    findReconciliationConflictByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingReconciliationConflict | undefined>;
    findQuotaReservation(reservationId: string | undefined): MaybePromise<BillingQuotaReservation | undefined>;
    findQuotaReservationByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingQuotaReservation | undefined>;
    findQuotaLedgerEntryByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingQuotaLedgerEntry | undefined>;
    findTariff(planId: string | undefined): MaybePromise<BillingTariff | undefined>;
    findTenant(tenantId: string | undefined): MaybePromise<BillingTenantState | undefined>;
    findTenantSubscription(tenantId: string | undefined): MaybePromise<BillingSubscriptionState | undefined>;
    listBillingSyncJobs(): MaybePromise<BillingSyncJob[]>;
    listBillingApprovals(input?: BillingApprovalListInput): MaybePromise<BillingApproval[]>;
    listBillingLegalEntities(input?: BillingLegalEntityListInput): MaybePromise<BillingLegalEntity[]>;
    listBillingTaxDocuments(input?: BillingTaxDocumentListInput): MaybePromise<BillingTaxDocument[]>;
    listPaymentRetrySchedules(input?: BillingPaymentRetryScheduleListInput): MaybePromise<BillingPaymentRetrySchedule[]>;
    listPaymentRetryKeys(input?: BillingPaymentRetryKeyListInput): MaybePromise<BillingPaymentRetryKey[]>;
    listPaymentDunningStates(input?: BillingPaymentDunningStateListInput): MaybePromise<BillingPaymentDunningState[]>;
    listReconciliationConflicts(input?: BillingReconciliationConflictListInput): MaybePromise<BillingReconciliationConflict[]>;
    listQuotaLedgerEntries(tenantId?: string): MaybePromise<BillingQuotaLedgerEntry[]>;
    listQuotaReservations(input?: BillingQuotaReservationListInput): MaybePromise<BillingQuotaReservation[]>;
    listTariffs(): MaybePromise<BillingTariff[]>;
    listTenantInvoices(tenantId: string | undefined): MaybePromise<BillingInvoiceState[]>;
    removeProvisionedTenant(tenantId: string): MaybePromise<void>;
    savePaymentRetrySchedule(schedule: BillingPaymentRetrySchedule): MaybePromise<BillingPaymentRetrySchedule>;
    savePaymentRetryKey(key: BillingPaymentRetryKey): MaybePromise<BillingPaymentRetryKey>;
    savePaymentDunningState(state: BillingPaymentDunningState): MaybePromise<BillingPaymentDunningState>;
    saveBillingApproval(approval: BillingApproval): MaybePromise<BillingApproval>;
    saveBillingLegalEntity(entity: BillingLegalEntity): MaybePromise<BillingLegalEntity>;
    saveBillingTaxDocument(document: BillingTaxDocument): MaybePromise<BillingTaxDocument>;
    saveTenant(tenant: BillingTenantState): MaybePromise<BillingTenantState>;
    saveReconciliationConflict(conflict: BillingReconciliationConflict): MaybePromise<BillingReconciliationConflict>;
    recordQuotaLedgerEntry(entry: BillingQuotaLedgerEntry): MaybePromise<BillingQuotaLedgerEntry>;
    releaseQuotaReservation(input: BillingQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation>;
    releaseExpiredQuotaReservation(input: BillingExpiredQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation | undefined>;
}
interface BillingTariffChangeInput {
    changes: Partial<BillingTenantState>;
    syncJob: BillingSyncJob;
    tenantId: string;
}
export interface BillingProviderSyncInput {
    event: BillingProviderSyncEvent;
    invoice?: BillingInvoiceState;
    paymentDunningState?: BillingPaymentDunningState;
    paymentRetryKey?: BillingPaymentRetryKey;
    paymentRetrySchedule?: BillingPaymentRetrySchedule;
    reconciliationConflict?: BillingReconciliationConflict;
    subscription?: BillingSubscriptionState;
    syncJob: BillingSyncJob;
    tenantChanges?: Partial<BillingTenantState>;
    tenantId: string;
}
export interface BillingQuotaReservationListInput {
    resource?: string;
    statuses?: BillingQuotaReservation["status"][];
    tenantId?: string;
}
export interface BillingQuotaReservationAtomicInput {
    limit: number;
    reservation: BillingQuotaReservation;
    used: number;
}
export type BillingQuotaReservationAtomicResult = {
    kind: "created" | "replay";
    reservation: BillingQuotaReservation;
    reserved: number;
} | {
    kind: "denied";
    reserved: number;
};
export interface BillingQuotaReservationClaimInput {
    leaseTimeoutMs?: number;
    limit?: number;
    now?: Date | string;
}
export interface BillingQuotaReservationCommitInput {
    auditEvent?: BillingAuditEvent;
    committedAt: string;
    idempotencyKey: string;
    reservationId: string;
    traceId: string;
}
export interface BillingQuotaReservationReleaseInput {
    auditEvent?: BillingAuditEvent;
    idempotencyKey: string;
    releasedAt: string;
    reservationId: string;
    traceId: string;
}
export interface BillingExpiredQuotaReservationReleaseInput extends BillingQuotaReservationReleaseInput {
    lockedAt: string;
}
export declare class BillingRepository implements BillingRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): BillingRepository;
    static useDefault(repository: BillingRepository): void;
    static inMemory(seed?: BillingState): BillingRepository;
    static prisma({ client }: PrismaBillingRepositoryOptions): BillingRepository;
    listTariffs(): MaybePromise<BillingTariff[]>;
    findTariff(planId: string | undefined): MaybePromise<BillingTariff | undefined>;
    findTenant(tenantId: string | undefined): MaybePromise<BillingTenantState | undefined>;
    saveTenant(tenant: BillingTenantState): MaybePromise<BillingTenantState>;
    removeProvisionedTenant(tenantId: string): MaybePromise<void>;
    findTenantSubscription(tenantId: string | undefined): MaybePromise<BillingSubscriptionState | undefined>;
    listTenantInvoices(tenantId: string | undefined): MaybePromise<BillingInvoiceState[]>;
    listBillingSyncJobs(): MaybePromise<BillingSyncJob[]>;
    listBillingApprovals(input?: BillingApprovalListInput): MaybePromise<BillingApproval[]>;
    listBillingLegalEntities(input?: BillingLegalEntityListInput): MaybePromise<BillingLegalEntity[]>;
    listBillingTaxDocuments(input?: BillingTaxDocumentListInput): MaybePromise<BillingTaxDocument[]>;
    listPaymentRetrySchedules(input?: BillingPaymentRetryScheduleListInput): MaybePromise<BillingPaymentRetrySchedule[]>;
    listPaymentRetryKeys(input?: BillingPaymentRetryKeyListInput): MaybePromise<BillingPaymentRetryKey[]>;
    listPaymentDunningStates(input?: BillingPaymentDunningStateListInput): MaybePromise<BillingPaymentDunningState[]>;
    listReconciliationConflicts(input?: BillingReconciliationConflictListInput): MaybePromise<BillingReconciliationConflict[]>;
    listQuotaLedgerEntries(tenantId?: string): MaybePromise<BillingQuotaLedgerEntry[]>;
    listQuotaReservations(input?: BillingQuotaReservationListInput): MaybePromise<BillingQuotaReservation[]>;
    findQuotaLedgerEntryByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingQuotaLedgerEntry | undefined>;
    findQuotaReservation(reservationId: string | undefined): MaybePromise<BillingQuotaReservation | undefined>;
    findQuotaReservationByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingQuotaReservation | undefined>;
    findProviderSyncEventByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingProviderSyncEvent | undefined>;
    findBillingApproval(approvalId: string | undefined, tenantId?: string): MaybePromise<BillingApproval | undefined>;
    findBillingLegalEntity(legalEntityId: string | undefined, tenantId?: string): MaybePromise<BillingLegalEntity | undefined>;
    findBillingTaxDocument(documentId: string | undefined, tenantId?: string): MaybePromise<BillingTaxDocument | undefined>;
    findPaymentRetryScheduleByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentRetrySchedule | undefined>;
    findPaymentRetryKeyByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentRetryKey | undefined>;
    findPaymentDunningStateByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingPaymentDunningState | undefined>;
    findReconciliationConflictByIdempotencyKey(idempotencyKey: string | undefined): MaybePromise<BillingReconciliationConflict | undefined>;
    recordQuotaLedgerEntry(entry: BillingQuotaLedgerEntry): MaybePromise<BillingQuotaLedgerEntry>;
    savePaymentRetrySchedule(schedule: BillingPaymentRetrySchedule): MaybePromise<BillingPaymentRetrySchedule>;
    savePaymentRetryKey(key: BillingPaymentRetryKey): MaybePromise<BillingPaymentRetryKey>;
    savePaymentDunningState(state: BillingPaymentDunningState): MaybePromise<BillingPaymentDunningState>;
    saveBillingApproval(approval: BillingApproval): MaybePromise<BillingApproval>;
    saveBillingLegalEntity(entity: BillingLegalEntity): MaybePromise<BillingLegalEntity>;
    saveBillingTaxDocument(document: BillingTaxDocument): MaybePromise<BillingTaxDocument>;
    decideBillingApproval(input: BillingApprovalDecisionInput): MaybePromise<BillingApproval>;
    saveReconciliationConflict(conflict: BillingReconciliationConflict): MaybePromise<BillingReconciliationConflict>;
    createQuotaReservation(reservation: BillingQuotaReservation): MaybePromise<BillingQuotaReservation>;
    reserveQuotaAtomically(input: BillingQuotaReservationAtomicInput): MaybePromise<BillingQuotaReservationAtomicResult>;
    claimExpiredQuotaReservations(input?: BillingQuotaReservationClaimInput): MaybePromise<BillingQuotaReservation[]>;
    commitQuotaReservation(input: BillingQuotaReservationCommitInput): MaybePromise<{
        reservation: BillingQuotaReservation;
        tenant: BillingTenantState;
    }>;
    releaseQuotaReservation(input: BillingQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation>;
    releaseExpiredQuotaReservation(input: BillingExpiredQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation | undefined>;
    applyTenantTariffChange(input: BillingTariffChangeInput): MaybePromise<{
        syncJob: BillingSyncJob;
        tenant: BillingTenantState;
    }>;
    applyProviderBillingSync(input: BillingProviderSyncInput): MaybePromise<{
        event: BillingProviderSyncEvent;
        invoice?: BillingInvoiceState;
        paymentDunningState?: BillingPaymentDunningState;
        paymentRetryKey?: BillingPaymentRetryKey;
        reconciliationConflict?: BillingReconciliationConflict;
        subscription?: BillingSubscriptionState;
        syncJob: BillingSyncJob;
        tenant: BillingTenantState;
    }>;
    appendProviderSyncAuditEvent(idempotencyKey: string, auditEvent: BillingProviderSyncAuditEvent): MaybePromise<BillingProviderSyncEvent | undefined>;
}
export interface PrismaBillingRepositoryOptions {
    client: PrismaBillingClient;
}
export interface PrismaBillingClient extends PrismaBillingDelegates {
    $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
    $transaction<TResult>(operation: (client: PrismaBillingTransactionalClient) => Promise<TResult>): Promise<TResult>;
}
type PrismaBillingTransactionalClient = PrismaBillingDelegates;
interface PrismaBillingDelegates {
    $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
    billingApproval: {
        create(input: {
            data: PrismaBillingApprovalCreateInput;
        }): Promise<PrismaBillingApprovalRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    approvalId?: string;
                    requestFingerprint?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingApprovalRow | null>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
            where: {
                status?: {
                    in: string[];
                };
                subjectType?: string;
                tenantId: string;
            };
        }): Promise<PrismaBillingApprovalRow[]>;
        findUnique(input: {
            where: {
                tenantId_approvalId: {
                    approvalId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaBillingApprovalRow | null>;
        update(input: {
            data: PrismaBillingApprovalUpdateInput;
            where: {
                tenantId_approvalId: {
                    approvalId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaBillingApprovalRow>;
    };
    billingLegalEntity: {
        create(input: {
            data: PrismaBillingLegalEntityCreateInput;
        }): Promise<PrismaBillingLegalEntityRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    legalEntityId?: string;
                    registrationNumber?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingLegalEntityRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where: {
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingLegalEntityRow[]>;
        findUnique(input: {
            where: {
                tenantId_legalEntityId: {
                    legalEntityId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaBillingLegalEntityRow | null>;
    };
    billingTaxDocument: {
        create(input: {
            data: PrismaBillingTaxDocumentCreateInput;
        }): Promise<PrismaBillingTaxDocumentRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    documentId?: string;
                    requestFingerprint?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingTaxDocumentRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where: {
                documentType?: {
                    in: string[];
                };
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingTaxDocumentRow[]>;
        findUnique(input: {
            where: {
                tenantId_documentId: {
                    documentId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaBillingTaxDocumentRow | null>;
    };
    billingInvoice: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: {
                tenantId: string;
            };
        }): Promise<PrismaBillingInvoiceRow[]>;
        upsert(input: {
            create: PrismaBillingInvoiceUpsertInput;
            update: PrismaBillingInvoiceUpsertInput;
            where: {
                provider_providerInvoiceId: {
                    provider: string;
                    providerInvoiceId: string;
                };
            };
        }): Promise<PrismaBillingInvoiceRow>;
    };
    billingProviderSyncEvent: {
        create(input: {
            data: PrismaBillingProviderSyncEventCreateInput;
        }): Promise<PrismaBillingProviderSyncEventRow>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingProviderSyncEventRow | null>;
        update(input: {
            data: {
                auditEvents: Array<Record<string, unknown>>;
            };
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingProviderSyncEventRow>;
    };
    billingQuotaReservation: {
        create(input: {
            data: PrismaBillingQuotaReservationCreateInput;
        }): Promise<PrismaBillingQuotaReservationRow>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            } | Array<{
                expiresAt: "asc";
            } | {
                createdAt: "asc";
            } | {
                lockedAt: {
                    nulls: "first";
                    sort: "asc";
                };
            } | {
                id: "asc";
            }>;
            where?: {
                expiresAt?: {
                    lte: Date;
                };
                OR?: Array<{
                    lockedAt: null;
                } | {
                    lockedAt: {
                        lte: Date;
                    };
                }>;
                resource?: string;
                status?: string | {
                    in: string[];
                };
                tenantId?: string;
            };
            take?: number;
        }): Promise<PrismaBillingQuotaReservationRow[]>;
        findUnique(input: {
            where: {
                id?: string;
                idempotencyKey?: string;
            };
        }): Promise<PrismaBillingQuotaReservationRow | null>;
        update(input: {
            data: PrismaBillingQuotaReservationUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaBillingQuotaReservationRow>;
        updateMany(input: {
            data: PrismaBillingQuotaReservationUpdateInput;
            where: {
                id: string;
                lockedAt?: Date | null;
                status: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    billingPaymentRetrySchedule: {
        create(input: {
            data: PrismaBillingPaymentRetryScheduleCreateInput;
        }): Promise<PrismaBillingPaymentRetryScheduleRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    idempotencyKey?: string;
                    scheduleId?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingPaymentRetryScheduleRow | null>;
        findMany(input: {
            orderBy: {
                nextAttemptAt: "desc";
            };
            where: {
                invoiceId?: string;
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingPaymentRetryScheduleRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingPaymentRetryScheduleRow | null>;
    };
    billingPaymentRetryKey: {
        create(input: {
            data: PrismaBillingPaymentRetryKeyCreateInput;
        }): Promise<PrismaBillingPaymentRetryKeyRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    idempotencyKey?: string;
                    retryKeyId?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingPaymentRetryKeyRow | null>;
        findMany(input: {
            orderBy: {
                firstAttemptAt: "desc";
            };
            where: {
                invoiceId?: string;
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingPaymentRetryKeyRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingPaymentRetryKeyRow | null>;
    };
    billingPaymentDunningState: {
        create(input: {
            data: PrismaBillingPaymentDunningStateCreateInput;
        }): Promise<PrismaBillingPaymentDunningStateRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    dunningId?: string;
                    idempotencyKey?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingPaymentDunningStateRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where: {
                invoiceId?: string;
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingPaymentDunningStateRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingPaymentDunningStateRow | null>;
    };
    billingReconciliationConflict: {
        create(input: {
            data: PrismaBillingReconciliationConflictCreateInput;
        }): Promise<PrismaBillingReconciliationConflictRow>;
        findFirst(input: {
            where: {
                OR: Array<{
                    conflictId?: string;
                    idempotencyKey?: string;
                    tenantId?: string;
                }>;
            };
        }): Promise<PrismaBillingReconciliationConflictRow | null>;
        findMany(input: {
            orderBy: {
                detectedAt: "desc";
            };
            where: {
                invoiceId?: string;
                severity?: {
                    in: string[];
                };
                status?: {
                    in: string[];
                };
                tenantId: string;
            };
        }): Promise<PrismaBillingReconciliationConflictRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingReconciliationConflictRow | null>;
    };
    billingQuotaLedgerEntry: {
        create(input: {
            data: PrismaBillingQuotaLedgerEntryCreateInput;
        }): Promise<PrismaBillingQuotaLedgerEntryRow>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
            where?: {
                tenantId: string;
            };
        }): Promise<PrismaBillingQuotaLedgerEntryRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): Promise<PrismaBillingQuotaLedgerEntryRow | null>;
    };
    billingSyncJob: {
        create(input: {
            data: PrismaBillingSyncJobCreateInput;
        }): Promise<PrismaBillingSyncJobRow>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaBillingSyncJobRow[]>;
    };
    billingTenantState: {
        create(input: {
            data: PrismaBillingTenantStateCreateInput;
        }): Promise<PrismaBillingTenantStateRow>;
        deleteMany(input: {
            where: {
                id: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            orderBy: {
                name: "asc";
            };
        }): Promise<PrismaBillingTenantStateRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaBillingTenantStateRow | null>;
        update(input: {
            data: PrismaBillingTenantStateUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaBillingTenantStateRow>;
    };
    billingSubscription: {
        findFirst(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where: {
                tenantId: string;
            };
        }): Promise<PrismaBillingSubscriptionRow | null>;
        upsert(input: {
            create: PrismaBillingSubscriptionUpsertInput;
            update: PrismaBillingSubscriptionUpsertInput;
            where: {
                provider_providerSubscriptionId: {
                    provider: string;
                    providerSubscriptionId: string;
                };
            };
        }): Promise<PrismaBillingSubscriptionRow>;
    };
}
interface PrismaBillingTenantStateRow {
    arr: number;
    healthScore: number;
    id: string;
    monthlyRevenue: number;
    name: string;
    owner: string;
    planId: string;
    region: string;
    sla: string;
    status: string;
    usage: unknown;
    users: number;
    workspaces: number;
}
type PrismaBillingTenantStateCreateInput = PrismaBillingTenantStateUpdateInput & {
    id: string;
};
interface PrismaBillingSyncJobRow {
    actor: string;
    actorName: string;
    attempts?: number;
    auditEventId: string;
    createdAt: Date | string;
    deadLetteredAt?: Date | string | null;
    fromPlanId: string;
    id: string;
    lastError?: string | null;
    lockedAt?: Date | string | null;
    nextAttemptAt?: Date | string | null;
    payload: unknown;
    publishedAt?: Date | string | null;
    queue: string;
    reason: string;
    status: string;
    tenantId: string;
    toPlanId: string;
    traceId: string;
}
interface PrismaBillingQuotaLedgerEntryRow {
    auditEvent?: unknown;
    createdAt: Date | string;
    decision: string;
    id: string;
    idempotencyKey: string;
    limit: number;
    mode: string;
    planId: string;
    projected: number;
    reason: string | null;
    remainingAfter: number;
    remainingBefore: number;
    requested: number;
    requestFingerprint: string;
    resource: string;
    tenantId: string;
    traceId: string;
    used: number;
}
interface PrismaBillingQuotaReservationRow {
    auditEvent?: unknown;
    auditEvents?: unknown;
    commitIdempotencyKey: string | null;
    committedAt: Date | string | null;
    createdAt: Date | string;
    expiresAt: Date | string;
    id: string;
    idempotencyKey: string;
    limit: number;
    lockedAt?: Date | string | null;
    planId: string;
    releaseIdempotencyKey: string | null;
    releasedAt: Date | string | null;
    requested: number;
    requestFingerprint: string;
    resource: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
    usedAfter: number | null;
    usedBefore: number;
}
interface PrismaBillingApprovalRow {
    approvalId: string;
    auditEvents?: unknown;
    createdAt: Date | string;
    decidedAt: Date | string | null;
    decidedBy: string | null;
    decidedByName: string | null;
    decisionReason: string | null;
    expiresAt: Date | string;
    reason: string;
    requestedBy: string;
    requestedByName: string;
    requestFingerprint: string;
    status: string;
    subjectId: string;
    subjectType: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
}
interface PrismaBillingLegalEntityRow {
    addressLine1: string;
    addressLine2: string | null;
    auditEvents?: unknown;
    city: string;
    country: string;
    createdAt: Date | string;
    legalEntityId: string;
    legalName: string;
    postalCode: string;
    region: string;
    registrationNumber: string;
    status: string;
    taxId: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
    vatId: string | null;
}
interface PrismaBillingTaxDocumentRow {
    auditEvents?: unknown;
    createdAt: Date | string;
    documentId: string;
    documentType: string;
    fileName: string;
    legalEntityId: string;
    mimeType: string;
    requestFingerprint: string;
    sha256: string;
    status: string;
    storageLocator: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
    uploadedBy: string;
    uploadedByName: string;
}
interface PrismaBillingPaymentRetryScheduleRow {
    attempt: number;
    createdAt: Date | string;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: Date | string | null;
    maxAttempts: number;
    nextAttemptAt: Date | string;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    scheduleId: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
}
interface PrismaBillingPaymentRetryKeyRow {
    attempt: number;
    createdAt: Date | string;
    firstAttemptAt: Date | string;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: Date | string | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    result: unknown;
    retryKeyId: string;
    scheduleId: string | null;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
}
interface PrismaBillingPaymentDunningStateRow {
    createdAt: Date | string;
    dunningId: string;
    failedAttempts: number;
    idempotencyKey: string;
    invoiceId: string;
    lastFailureAt: Date | string | null;
    nextActionAt: Date | string | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    stage: string;
    status: string;
    subscriptionId: string | null;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
}
interface PrismaBillingReconciliationConflictRow {
    actual: unknown;
    conflictId: string;
    createdAt: Date | string;
    detectedAt: Date | string;
    expected: unknown;
    idempotencyKey: string;
    invoiceId: string;
    provider: string;
    providerInvoiceId: string;
    reason: string;
    requestFingerprint: string;
    resolution: string | null;
    resolvedAt: Date | string | null;
    severity: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date | string;
}
interface PrismaBillingSubscriptionRow {
    billingPeriod: string;
    cancelAtPeriodEnd: boolean;
    createdAt: Date | string;
    currency: string;
    currentPeriodEnd: Date | string;
    currentPeriodStart: Date | string;
    id: string;
    planId: string;
    provider: string;
    providerCustomerId: string;
    providerSubscriptionId: string;
    seats: number;
    status: string;
    tenantId: string;
    unitAmountMonthly: number;
    updatedAt: Date | string;
}
interface PrismaBillingInvoiceRow {
    amountDue: number;
    amountPaid: number;
    createdAt: Date | string;
    currency: string;
    dueAt: Date | string;
    hostedInvoiceUrl: string | null;
    id: string;
    paidAt: Date | string | null;
    paymentStatus: string;
    provider: string;
    providerInvoiceId: string;
    status: string;
    subscriptionId: string | null;
    tenantId: string;
    updatedAt: Date | string;
}
interface PrismaBillingProviderSyncEventRow {
    auditEvents?: unknown;
    createdAt: Date | string;
    eventType: string;
    id: string;
    idempotencyKey: string;
    payload: unknown;
    provider: string;
    requestFingerprint: string;
    status: string;
    syncJobId: string;
    tenantId: string;
    traceId: string;
}
interface PrismaBillingTenantStateUpdateInput {
    arr?: number;
    healthScore?: number;
    monthlyRevenue?: number;
    name?: string;
    owner?: string;
    planId?: string;
    region?: string;
    sla?: string;
    status?: string;
    usage?: TenantBillingState["usage"];
    users?: number;
    workspaces?: number;
}
interface PrismaBillingSubscriptionUpsertInput {
    billingPeriod: string;
    cancelAtPeriodEnd: boolean;
    createdAt: Date;
    currency: string;
    currentPeriodEnd: Date;
    currentPeriodStart: Date;
    id: string;
    planId: string;
    provider: string;
    providerCustomerId: string;
    providerSubscriptionId: string;
    seats: number;
    status: string;
    tenantId: string;
    unitAmountMonthly: number;
    updatedAt: Date;
}
interface PrismaBillingInvoiceUpsertInput {
    amountDue: number;
    amountPaid: number;
    createdAt: Date;
    currency: string;
    dueAt: Date;
    hostedInvoiceUrl: string | null;
    id: string;
    paidAt: Date | null;
    paymentStatus: string;
    provider: string;
    providerInvoiceId: string;
    status: string;
    subscriptionId: string | null;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaBillingProviderSyncEventCreateInput {
    auditEvents?: Array<Record<string, unknown>>;
    createdAt: Date;
    eventType: string;
    id: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
    provider: string;
    requestFingerprint: string;
    status: string;
    syncJobId: string;
    tenantId: string;
    traceId: string;
}
interface PrismaBillingQuotaReservationCreateInput {
    auditEvent?: Record<string, unknown> | null;
    auditEvents?: Array<Record<string, unknown>>;
    commitIdempotencyKey: string | null;
    committedAt: Date | null;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    idempotencyKey: string;
    limit: number;
    lockedAt: Date | null;
    planId: string;
    releaseIdempotencyKey: string | null;
    releasedAt: Date | null;
    requested: number;
    requestFingerprint: string;
    resource: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
    usedAfter: number | null;
    usedBefore: number;
}
interface PrismaBillingQuotaReservationUpdateInput {
    auditEvent?: Record<string, unknown> | null;
    auditEvents?: Array<Record<string, unknown>>;
    commitIdempotencyKey?: string | null;
    committedAt?: Date | null;
    lockedAt?: Date | null;
    releaseIdempotencyKey?: string | null;
    releasedAt?: Date | null;
    status?: string;
    traceId?: string;
    updatedAt?: Date;
    usedAfter?: number | null;
}
interface PrismaBillingPaymentRetryScheduleCreateInput {
    attempt: number;
    createdAt: Date;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: Date | null;
    maxAttempts: number;
    nextAttemptAt: Date;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    scheduleId: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingApprovalCreateInput {
    approvalId: string;
    auditEvents: BillingApprovalDecisionAuditEvent[];
    createdAt: Date;
    decidedAt: Date | null;
    decidedBy: string | null;
    decidedByName: string | null;
    decisionReason: string | null;
    expiresAt: Date;
    reason: string;
    requestedBy: string;
    requestedByName: string;
    requestFingerprint: string;
    status: string;
    subjectId: string;
    subjectType: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingLegalEntityCreateInput {
    addressLine1: string;
    addressLine2: string | null;
    auditEvents: BillingLegalEntityAuditEvent[];
    city: string;
    country: string;
    createdAt: Date;
    legalEntityId: string;
    legalName: string;
    postalCode: string;
    region: string;
    registrationNumber: string;
    status: string;
    taxId: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
    vatId: string | null;
}
interface PrismaBillingTaxDocumentCreateInput {
    auditEvents: BillingTaxDocumentAuditEvent[];
    createdAt: Date;
    documentId: string;
    documentType: string;
    fileName: string;
    legalEntityId: string;
    mimeType: string;
    requestFingerprint: string;
    sha256: string;
    status: string;
    storageLocator: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
    uploadedBy: string;
    uploadedByName: string;
}
interface PrismaBillingApprovalUpdateInput {
    auditEvents: BillingApprovalDecisionAuditEvent[];
    decidedAt: Date | null;
    decidedBy: string | null;
    decidedByName: string | null;
    decisionReason: string | null;
    status: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingPaymentRetryKeyCreateInput {
    attempt: number;
    createdAt: Date;
    firstAttemptAt: Date;
    idempotencyKey: string;
    invoiceId: string;
    lastAttemptAt: Date | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    result: Record<string, unknown>;
    retryKeyId: string;
    scheduleId: string | null;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingPaymentDunningStateCreateInput {
    createdAt: Date;
    dunningId: string;
    failedAttempts: number;
    idempotencyKey: string;
    invoiceId: string;
    lastFailureAt: Date | null;
    nextActionAt: Date | null;
    provider: string;
    providerInvoiceId: string;
    requestFingerprint: string;
    stage: string;
    status: string;
    subscriptionId: string | null;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingReconciliationConflictCreateInput {
    actual: Record<string, unknown>;
    conflictId: string;
    createdAt: Date;
    detectedAt: Date;
    expected: Record<string, unknown>;
    idempotencyKey: string;
    invoiceId: string;
    provider: string;
    providerInvoiceId: string;
    reason: string;
    requestFingerprint: string;
    resolution: string | null;
    resolvedAt: Date | null;
    severity: string;
    status: string;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaBillingSyncJobCreateInput {
    actor: string;
    actorName: string;
    attempts?: number;
    auditEventId: string;
    createdAt: Date;
    deadLetteredAt?: Date | null;
    fromPlanId: string;
    id: string;
    lastError?: string | null;
    lockedAt?: Date | null;
    nextAttemptAt?: Date | null;
    payload: Record<string, unknown>;
    publishedAt?: Date | null;
    queue: string;
    reason: string;
    status: string;
    tenantId: string;
    toPlanId: string;
    traceId: string;
}
interface PrismaBillingQuotaLedgerEntryCreateInput {
    auditEvent?: Record<string, unknown> | null;
    createdAt: Date;
    decision: string;
    id: string;
    idempotencyKey: string;
    limit: number;
    mode: string;
    planId: string;
    projected: number;
    reason: string | null;
    remainingAfter: number;
    remainingBefore: number;
    requested: number;
    requestFingerprint: string;
    resource: string;
    tenantId: string;
    traceId: string;
    used: number;
}
export declare function createEmptyBillingState(): BillingState;
export {};
