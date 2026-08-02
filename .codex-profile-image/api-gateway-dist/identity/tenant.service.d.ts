import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository, type IdentityTenant } from "./identity.repository.js";
interface TenantFilters {
    query?: string;
    region?: string;
    status?: string;
}
export interface TenantListData {
    items: IdentityTenant[];
    filters: TenantFilters;
    totals: {
        all: number;
        active: number;
        trial: number;
        watch: number;
        restricted: number;
    };
}
export interface TenantDetailData {
    tenant: IdentityTenant;
    users: Awaited<ReturnType<IdentityRepository["findTenantUsers"]>>;
    tariff?: Awaited<ReturnType<IdentityRepository["listServiceAdminTariffs"]>>[number];
    incidents: Awaited<ReturnType<IdentityRepository["listServiceAdminIncidents"]>>;
    flags: Awaited<ReturnType<IdentityRepository["listServiceAdminFeatureFlags"]>>;
    auditEvents: Awaited<ReturnType<IdentityRepository["findTenantAuditEvents"]>>;
}
interface TenantStatusPayload {
    confirmed?: boolean;
    reason?: string;
    status: string;
    tenantId: string;
}
export declare class TenantService {
    private readonly identityRepository;
    constructor(identityRepository?: IdentityRepository);
    fetchTenants(filters?: TenantFilters): Promise<BackendEnvelope<TenantListData>>;
    fetchTenantDetail(tenantId: string): Promise<BackendEnvelope<TenantDetailData | Record<string, never>>>;
    updateTenantStatus({ confirmed, reason, status, tenantId }: TenantStatusPayload): Promise<BackendEnvelope<unknown>>;
    private buildTenantDetail;
}
export {};
