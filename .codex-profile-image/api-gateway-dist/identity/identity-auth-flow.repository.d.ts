import { IdentityRepository, type IdentityTenant, type IdentityTenantUser } from "./identity.repository.js";
export interface IdentityTenantMembershipChoice {
    email: string;
    id: string;
    role: string;
    selectedAt: string | null;
    tenantId: string;
    tenantName: string;
}
export declare function resetIdentityAuthFlowStore(): void;
export declare function listTenantMembershipsForEmail(email: string, repository?: IdentityRepository): Promise<IdentityTenantMembershipChoice[]>;
export declare function tenantMembershipsFromUsers(email: string, users: IdentityTenantUser[], tenants: IdentityTenant[]): IdentityTenantMembershipChoice[];
export declare function selectTenantMembership(input: {
    email: string;
    tenantId: string;
}, repository?: IdentityRepository): Promise<IdentityTenantMembershipChoice | null>;
export declare function findTenantUserForMembership(email: string, tenantId: string, repository?: IdentityRepository): Promise<IdentityTenantUser | undefined>;
