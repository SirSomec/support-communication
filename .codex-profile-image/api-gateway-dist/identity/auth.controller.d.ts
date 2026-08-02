import { AuthService } from "./auth.service.js";
import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { type TenantOperatorRequest } from "./tenant-operator-auth.js";
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    getAuthState(request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").AuthStateData>>;
    login(payload: {
        email?: string;
        mfaChallengeId?: string;
        otp?: string;
        password?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").LoginData>>;
    tenantLogin(payload: {
        email?: string;
        mfaChallengeId?: string;
        otp?: string;
        password?: string;
        tenantId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").TenantOperatorLoginData>>;
    tenantState(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").TenantOperatorStateData>>;
    tenantLogout(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").TenantOperatorLogoutData>>;
    selectTenant(payload: {
        tenantId?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<{
        selected: boolean;
    }>>;
    acceptInvite(payload: {
        code?: string;
        email?: string;
        mfaChallengeId?: string;
        otp?: string;
        password?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<{
        authenticated: boolean;
    }>>;
    requestRecovery(payload: {
        email?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<{
        queued: boolean;
    }>>;
    completeRecovery(payload: {
        email?: string;
        mfaChallengeId?: string;
        otp?: string;
        password?: string;
        token?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<{
        authenticated: boolean;
    }>>;
    startOidcLogin(payload: {
        domain?: string;
        providerId?: string;
        redirectUri?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").OidcLoginStartData>>;
    completeOidcCallback(query: {
        code?: string;
        error?: string;
        error_description?: string;
        state?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").OidcCallbackData>>;
    completeSamlAcs(payload: {
        assertionExpiresAt?: string;
        assertionId?: string;
        audience?: string;
        providerId?: string;
        requestId?: string;
        subjectId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").SamlAcsData>>;
    logout(payload: {
        reason?: string;
    } | undefined, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<import("./auth.service.js").LogoutData>>;
}
