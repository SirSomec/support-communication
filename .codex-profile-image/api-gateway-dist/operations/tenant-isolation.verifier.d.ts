export type TenantIsolationBoundary = "repository" | "api";
export type TenantIsolationExpectedTenantSource = "argument" | "context" | "record-owner";
export interface TenantOwnedMethodCatalogEntry {
    readonly boundary: TenantIsolationBoundary;
    readonly expectedTenantSource: TenantIsolationExpectedTenantSource;
    readonly id: string;
    readonly method: string;
    readonly service: "identity" | "conversation" | "workspace" | "billing" | "quality" | "routing";
}
export interface TenantIsolationCheck<Row extends object = Record<string, unknown>> {
    readonly expectedTenantId: string;
    readonly id: string;
    readonly loadRows: () => Promise<readonly Row[]> | readonly Row[];
    readonly recordId?: (row: Row) => string;
    readonly tenantId?: (row: Row) => string | null | undefined;
}
export interface TenantIsolationFailure {
    readonly checkId: string;
    readonly expectedTenantId: string;
    readonly leakedRecordIds: string[];
    readonly leakedTenantIds: string[];
}
export interface TenantIsolationVerificationReport {
    readonly checked: number;
    readonly failures: TenantIsolationFailure[];
    readonly status: "pass" | "fail";
}
type MaybePromise<T> = T | Promise<T>;
interface TenantScopedRow {
    readonly id?: unknown;
    readonly tenantId?: unknown;
}
export interface IdentityRepositoryTenantIsolationSource {
    findTenantAuditEvents(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
    findTenantUsers(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
    listPermissionDenialEvents(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listRbacRoleGrants(input?: {
        readonly tenantId?: string | null;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export interface ConversationRepositoryTenantIsolationSource {
    listDeliveryReceipts(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listOutboundDescriptors(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listRealtimeEvents(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export interface WorkspaceRepositoryTenantIsolationSource {
    findClientProfile(sourceProfileId: string, scope?: {
        readonly tenantId?: string;
    }): MaybePromise<TenantScopedRow | undefined>;
    findFile(fileId: string, scope?: {
        readonly tenantId?: string;
    }): MaybePromise<TenantScopedRow | undefined>;
    findFileScanResultIdempotency(key: string, scope?: {
        readonly tenantId?: string;
    }): MaybePromise<TenantScopedRow | undefined>;
    findTemplate(templateId: string, scope?: {
        readonly tenantId?: string;
    }): MaybePromise<TenantScopedRow | undefined>;
    listClientMergeConflicts(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listClientMergeEvents(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listTemplates(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export interface WorkspaceRepositoryTenantIsolationInput {
    readonly fileId: string;
    readonly idempotencyKey: string;
    readonly sourceProfileId: string;
    readonly templateId: string;
    readonly tenantId: string;
}
export interface BillingRepositoryTenantIsolationSource {
    findTenant(tenantId: string): MaybePromise<TenantScopedRow | undefined>;
    findTenantSubscription(tenantId: string): MaybePromise<TenantScopedRow | undefined>;
    listTenantInvoices(tenantId: string): MaybePromise<readonly TenantScopedRow[]>;
    listQuotaLedgerEntries(tenantId?: string): MaybePromise<readonly TenantScopedRow[]>;
    listQuotaReservations(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export interface RoutingRepositoryTenantIsolationSource {
    listOperatorCapacities(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listQueueMemberships(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listRoutingRules(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export interface QualityRepositoryTenantIsolationSource {
    listAiScoringAudits(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listManualQaReviews(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
    listQualityRatings(input?: {
        readonly tenantId?: string;
    }): MaybePromise<readonly TenantScopedRow[]>;
}
export declare function listTenantOwnedRepositoryMethodCatalog(filters?: {
    readonly service?: TenantOwnedMethodCatalogEntry["service"];
}): TenantOwnedMethodCatalogEntry[];
export declare function createIdentityRepositoryTenantIsolationChecks(repository: IdentityRepositoryTenantIsolationSource, tenantId: string): TenantIsolationCheck<TenantScopedRow>[];
export declare function createConversationRepositoryTenantIsolationChecks(repository: ConversationRepositoryTenantIsolationSource, tenantId: string): TenantIsolationCheck<TenantScopedRow>[];
export declare function createWorkspaceRepositoryTenantIsolationChecks(repository: WorkspaceRepositoryTenantIsolationSource, input: WorkspaceRepositoryTenantIsolationInput): TenantIsolationCheck<TenantScopedRow>[];
export declare function createBillingRepositoryTenantIsolationChecks(repository: BillingRepositoryTenantIsolationSource, tenantId: string): TenantIsolationCheck<TenantScopedRow>[];
export declare function createRoutingRepositoryTenantIsolationChecks(repository: RoutingRepositoryTenantIsolationSource, tenantId: string): TenantIsolationCheck<TenantScopedRow>[];
export declare function createQualityRepositoryTenantIsolationChecks(repository: QualityRepositoryTenantIsolationSource, tenantId: string): TenantIsolationCheck<TenantScopedRow>[];
export declare function verifyTenantIsolationChecks<Row extends object = Record<string, unknown>>(checks: readonly TenantIsolationCheck<Row>[]): Promise<TenantIsolationVerificationReport>;
export {};
