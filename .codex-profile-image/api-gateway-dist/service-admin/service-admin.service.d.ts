import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import { type AuditExportFilters } from "./service-admin-audit.persistence.js";
interface UserFilters extends AuditExportFilters {
}
interface UserActionPayload {
    actor?: ServiceAdminActor;
    confirmed?: boolean;
    reason?: string;
    userId?: string;
}
interface ImpersonationPayload {
    actor?: ServiceAdminActor;
    approvalId?: string;
    confirmed?: boolean;
    durationMinutes?: number;
    mode?: string;
    reason?: string;
    tenantId?: string;
    userId?: string;
    writeAccess?: boolean;
}
interface BreakGlassPayload {
    actor?: ServiceAdminActor;
    action?: string;
    confirmed?: boolean;
    durationMinutes?: number;
    reason?: string;
    target?: string;
    tenantId?: string;
    userId?: string;
}
interface BreakGlassDecisionPayload {
    actor?: ServiceAdminActor;
    approvalId?: string;
    confirmed?: boolean;
    decision?: string;
    reason?: string;
}
export declare class ServiceAdminService {
    private readonly identityRepository;
    constructor(identityRepository?: IdentityRepository);
    fetchSupportUsers(filters?: UserFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchAuditEvents(filters?: UserFilters): Promise<BackendEnvelope<Record<string, unknown>>>;
    requestAuditExport(filters?: UserFilters, actor?: ServiceAdminActor | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    redactAuditEvent(payload?: {
        actor?: ServiceAdminActor;
        eventId?: string;
        fields?: string[];
        reason?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    resetTwoFactor(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    forceLogout(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    blockUser(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    unblockUser(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    resendInvite(payload: UserActionPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    startImpersonation(payload: ImpersonationPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    stopImpersonation(payload: {
        actor?: ServiceAdminActor;
        impersonationId?: string;
        reason?: string;
    } | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    requestBreakGlassApproval(payload: BreakGlassPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    decideBreakGlassApproval(payload: BreakGlassDecisionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private applyUserAction;
    private listTenants;
    private findTenant;
    private findUser;
    private fetchRepositoryUsers;
    private loadAuditRedactionOverlays;
    private findActiveImpersonation;
    private createImpersonationWithConflictEnvelope;
    private validateBreakGlassWriteApproval;
    private writeApprovalDenied;
    private notFoundWithAudit;
    private recordAudit;
    private buildAuditEvent;
    private validatePrivilegedRequest;
}
export {};
