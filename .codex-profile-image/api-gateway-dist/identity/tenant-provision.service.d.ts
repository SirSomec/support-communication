import { type BackendEnvelope } from "@support-communication/envelope";
import { BillingRepository } from "../billing/billing.repository.js";
import { IdentityRepository, type IdentityRbacRoleGrant } from "./identity.repository.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
import type { ServiceAdminRequest } from "./service-admin-auth.js";
interface TenantProvisionPayload {
    admin?: {
        email?: string;
        mfa?: boolean;
        name?: string;
        password?: string;
        role?: string;
    };
    channel?: {
        domain?: string;
        type?: string;
    };
    employees?: Array<{
        email?: string;
        name?: string;
        role?: string;
        team?: string;
    }>;
    plan?: {
        billingCycle?: string;
        id?: string;
        trial?: boolean;
    };
    limits?: {
        afterHoursBot?: boolean;
        aiAssist?: boolean;
        concurrentDialogs?: number;
        dailyMessages?: number;
        operatorLimit?: number;
    };
    tenant?: {
        industry?: string;
        name?: string;
        region?: string;
        slug?: string;
    };
}
export interface TenantProvisionData {
    admin: {
        email: string;
        id: string;
        name: string;
        role: string;
        tenantId: string;
    };
    defaultWorkspaceIds: string[];
    embedSnippet: string;
    operator: {
        email: string;
        id: string;
        name: string;
        role: string;
    };
    publicApiKey: string;
    roleGrants: IdentityRbacRoleGrant[];
    session: {
        accessToken: string;
        expiresAt: string;
    };
    tenant: {
        id: string;
        name: string;
        planId: string;
        region: string;
        slug: string;
        status: "trial" | "active";
    };
    tenantId: string;
}
export declare class TenantProvisionService {
    private readonly identityRepository;
    private readonly billingRepository;
    private readonly integrationRepository;
    constructor(identityRepository?: IdentityRepository, billingRepository?: BillingRepository, integrationRepository?: IntegrationRepository);
    provisionTenant(payload?: TenantProvisionPayload, request?: Partial<ServiceAdminRequest>): Promise<BackendEnvelope<TenantProvisionData | Record<string, never>>>;
}
export {};
