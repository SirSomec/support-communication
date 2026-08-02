import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "./identity.repository.js";
type ResolvedRole = string | "unknown";
interface PermissionPayload {
    action: string;
    actorId?: string | null;
    actorRole?: string;
    resource: string;
    roleMode?: string;
    tenantId?: string;
}
export interface PermissionDecision {
    allowed: boolean;
    action: string;
    resource: string;
    role: ResolvedRole;
    grantId?: string;
    policyVersionId?: string;
    serverValidated: true;
    tenantId?: string;
    groupIds: string[];
    auditEvent: {
        id: string;
        action: string;
        resource: string;
        role: ResolvedRole;
        result: "allowed" | "denied";
        immutable: true;
    };
}
export interface PermissionModel {
    roles: Array<{
        actions: string[];
        aliases: string[];
        key: string;
        sections: string[];
    }>;
    actions: string[];
    actionSectionMap: Record<string, string>;
    sections: string[];
    serverValidation: true;
    denialAudit: true;
    groups: string[];
}
export declare class PermissionService {
    private readonly identityRepository;
    constructor(identityRepository?: IdentityRepository);
    validatePermission({ action, actorId, actorRole, resource, roleMode, tenantId }: PermissionPayload): Promise<BackendEnvelope<PermissionDecision | Record<string, unknown>>>;
    fetchPermissionModel(): Promise<BackendEnvelope<PermissionModel>>;
}
export {};
