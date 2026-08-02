import { type BackendEnvelope } from "@support-communication/envelope";
import { type OutboxEvent } from "@support-communication/events";
import { IdentityRepository, type StoredServiceAdminSession } from "./identity.repository.js";
import { type MfaOtpRuntime } from "./mfa-otp.js";
import { type OperatorPresenceService } from "../presence/presence.service.js";
export interface AuthStateData {
    authenticated: boolean;
    session: StoredServiceAdminSession | null;
    states: string[];
    impersonating: boolean;
}
interface LoginPayload {
    email?: string;
    mfaChallengeId?: string;
    otp?: string;
    password?: string;
}
interface StartOidcLoginPayload {
    domain?: string;
    providerId?: string;
    redirectUri?: string;
}
interface CompleteOidcCallbackPayload {
    code?: string;
    error?: string;
    errorDescription?: string;
    state?: string;
}
interface CompleteSamlAcsPayload {
    assertionExpiresAt?: string;
    assertionId?: string;
    audience?: string;
    now?: Date;
    providerId?: string;
    requestId?: string;
    subjectId?: string;
}
interface TenantOperatorLoginPayload {
    email?: string;
    mfaChallengeId?: string;
    otp?: string;
    password?: string;
    tenantId?: string;
}
interface TenantOperatorLoginContext {
    forceMfa?: boolean;
}
interface TenantOperatorSessionContext {
    sessionId?: string;
    tenantId?: string;
    userId?: string;
}
interface AcceptInvitePayload {
    code?: string;
    email?: string;
    mfaChallengeId?: string;
    otp?: string;
    password?: string;
}
interface CompleteRecoveryPayload {
    email?: string;
    mfaChallengeId?: string;
    otp?: string;
    password?: string;
    token?: string;
}
export type LoginData = {
    authenticated: false;
    authState: "anonymous";
    nextStep: "password";
} | {
    authenticated: false;
    authState: "mfa_required";
    email?: string;
    mfaChallengeId?: string;
    nextStep: "otp";
} | {
    authenticated: true;
    authState: "mfa_verified";
    accessToken?: string;
    session: StoredServiceAdminSession;
    auditEvent: {
        id: string;
        action: string;
        immutable: boolean;
        result: string;
    };
    outbox: OutboxEvent;
};
export interface LogoutData {
    authenticated: false;
    authState: "anonymous";
    reason: string;
    auditEvent: {
        id: string;
        action: string;
        immutable: boolean;
        reason: string;
    };
    outbox?: OutboxEvent;
}
export interface OidcLoginStartData {
    authorizationUrl: string;
    callbackDescriptorId: string;
    expiresAt: string;
    providerId: string;
    redirectUri: string;
    state: string;
}
export interface OidcCallbackData {
    authenticated: false;
    authState: "anonymous" | "oidc_callback_verified";
    callbackDescriptorId?: string;
    consumedAt?: string;
    nextStep: "authorization" | "token_exchange";
    providerId?: string;
    state?: string;
}
export interface SamlAcsData {
    assertionExpiresAt?: string;
    assertionId?: string;
    authenticated: false;
    authState: "anonymous" | "saml_assertion_verified";
    nextStep: "authorization" | "session_issue";
    providerId?: string;
    requestId?: string;
    subjectId?: string;
}
export interface TenantOperatorLoginData {
    accessToken?: string;
    authenticated: boolean;
    mfaChallengeId?: string;
    memberships?: Array<{
        id: string;
        role: string;
        selectedAt: string | null;
        tenantId: string;
        tenantName: string;
    }>;
    operator: {
        email: string;
        id: string;
        name: string;
        role: string;
    } | null;
    permissions: string[];
    tenantId: string | null;
    nextStep?: "otp";
}
export interface TenantOperatorStateData {
    authenticated: boolean;
    operator: {
        email: string;
        id: string;
        name: string;
        role: string;
    } | null;
    permissions: string[];
    sessionId: string | null;
    tenantId: string | null;
}
export interface TenantOperatorLogoutData {
    authenticated: false;
    revoked: boolean;
    sessionId: string | null;
}
export declare class AuthService {
    private readonly operatorPresenceService?;
    private readonly identityRepository;
    private readonly mfaOtp;
    private readonly defaultRuntimeWiring;
    private serviceAdminMfaOtpOverride?;
    constructor(identityRepository?: IdentityRepository, mfaOtp?: MfaOtpRuntime, serviceAdminMfaOtp?: MfaOtpRuntime, operatorPresenceService?: Pick<OperatorPresenceService, "markMyPresenceUnavailableIfOnline"> | undefined);
    /**
     * ВРЕМЕННО (2026-07-18): MFA-письма администратора сервиса всегда уходят
     * через env-SMTP (в пилоте — mailpit), минуя настройки служебной почты.
     * Пилотная учётка сервис-админа живёт на вымышленном адресе, и реальная
     * почта сделала бы вход в админ-панель невозможным. Обход действует только
     * при дефолтной проводке: инжектированный в тестах runtime уважается.
     * Убрать вместе с переводом сервис-админов на настоящие адреса.
     */
    private serviceAdminMfaOtp;
    getAuthState(context?: {
        sessionId?: string;
    }): Promise<BackendEnvelope<AuthStateData>>;
    login({ email, mfaChallengeId, otp, password }?: LoginPayload): Promise<BackendEnvelope<LoginData>>;
    startOidcLogin({ domain, providerId, redirectUri }?: StartOidcLoginPayload): Promise<BackendEnvelope<OidcLoginStartData>>;
    completeOidcCallback({ code, error, errorDescription, state }?: CompleteOidcCallbackPayload): Promise<BackendEnvelope<OidcCallbackData>>;
    completeSamlAcs({ assertionExpiresAt, assertionId, audience, now, providerId, requestId, subjectId }?: CompleteSamlAcsPayload): Promise<BackendEnvelope<SamlAcsData>>;
    logout({ reason, sessionId }?: {
        reason?: string;
        sessionId?: string;
    }): Promise<BackendEnvelope<LogoutData>>;
    loginTenantOperator({ email, mfaChallengeId, otp, password, tenantId }?: TenantOperatorLoginPayload, { forceMfa }?: TenantOperatorLoginContext): Promise<BackendEnvelope<TenantOperatorLoginData>>;
    private upgradeLegacyPasswordCredential;
    private createAndDeliverMfaChallenge;
    getTenantOperatorState({ sessionId }?: TenantOperatorSessionContext): Promise<BackendEnvelope<TenantOperatorStateData>>;
    logoutTenantOperator({ sessionId, tenantId, userId }?: TenantOperatorSessionContext): Promise<BackendEnvelope<TenantOperatorLogoutData>>;
    acceptInvite({ code, email, mfaChallengeId, otp, password }?: AcceptInvitePayload): Promise<BackendEnvelope<{
        authenticated: boolean;
    }>>;
    requestRecovery({ email }?: {
        email?: string;
    }): Promise<BackendEnvelope<{
        queued: boolean;
    }>>;
    completeRecovery({ email, mfaChallengeId, otp, password, token }?: CompleteRecoveryPayload): Promise<BackendEnvelope<{
        authenticated: boolean;
    }>>;
    selectTenant({ email, tenantId, userId }?: {
        email?: string;
        tenantId?: string;
        userId?: string;
    }): Promise<BackendEnvelope<{
        selected: boolean;
    }>>;
    private recordAuthFlowAudit;
}
export {};
