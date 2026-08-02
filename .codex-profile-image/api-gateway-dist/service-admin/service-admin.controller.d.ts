import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { ServiceAdminService } from "./service-admin.service.js";
interface UserActionBody {
    confirmed?: boolean;
    reason?: string;
}
interface ImpersonationBody {
    approvalId?: string;
    confirmed?: boolean;
    durationMinutes?: number;
    mode?: string;
    reason?: string;
    tenantId?: string;
    userId?: string;
    writeAccess?: boolean;
}
interface BreakGlassBody {
    action?: string;
    confirmed?: boolean;
    durationMinutes?: number;
    reason?: string;
    target?: string;
    tenantId?: string;
    userId?: string;
}
interface BreakGlassDecisionBody {
    confirmed?: boolean;
    decision?: string;
    reason?: string;
}
export declare class ServiceAdminController {
    private readonly serviceAdminService;
    constructor(serviceAdminService: ServiceAdminService);
    fetchSupportUsers(filters: {
        query?: string;
        status?: string;
        tenantId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resetTwoFactor(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resetMfaAlias(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    forceLogout(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    forceLogoutAlias(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    blockUser(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    unblockUser(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resendInvite(userId: string, payload: UserActionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    startImpersonation(payload: ImpersonationBody, request: ServiceAdminRequest): import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>> | Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    startImpersonationAlias(payload: ImpersonationBody, request: ServiceAdminRequest): import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>> | Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    stopImpersonation(impersonationId: string, payload: {
        reason?: string;
    }, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    requestBreakGlassApproval(payload: BreakGlassBody, request: ServiceAdminRequest): import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>> | Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    requestBreakGlassApprovalAlias(payload: BreakGlassBody, request: ServiceAdminRequest): import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>> | Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    decideBreakGlassApproval(approvalId: string, payload: BreakGlassDecisionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    decideBreakGlassApprovalAlias(approvalId: string, payload: BreakGlassDecisionBody, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchAuditEvents(filters: {
        action?: string;
        actorId?: string;
        cursor?: string;
        limit?: number | string;
        period?: string;
        query?: string;
        severity?: string;
        status?: string;
        target?: string;
        tenantId?: string;
        userId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    requestAuditExport(payload: {
        action?: string;
        actorId?: string;
        cursor?: string;
        limit?: number | string;
        period?: string;
        query?: string;
        severity?: string;
        status?: string;
        target?: string;
        tenantId?: string;
        userId?: string;
    }, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    redactAuditEvent(eventId: string, payload: {
        fields?: string[];
        reason?: string;
    }, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
