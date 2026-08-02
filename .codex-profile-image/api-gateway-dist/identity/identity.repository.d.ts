import { type ServiceAdminSessionRecord } from "@support-communication/auth-context";
import { type OutboxEvent } from "@support-communication/events";
import type { IdentityAvailableOrganization, IdentityPermissionRole, IdentityServiceAdminFeatureFlag, IdentityServiceAdminIncident, IdentityServiceAdminTariff, IdentityTenant, IdentityTenantAuditEvent, IdentityTenantUser } from "./identity.types.js";
export type { IdentityPermissionRole, IdentityServiceAdminFeatureFlag, IdentityServiceAdminIncident, IdentityServiceAdminTariff, IdentityTenant, IdentityTenantAuditEvent, IdentityTenantUser } from "./identity.types.js";
export interface IdentityRbacPolicyVersion {
    activatedAt: string | null;
    checksum: string;
    createdAt: string;
    createdBy: string;
    description: string;
    id: string;
    status: "active" | "draft" | "retired";
    version: string;
}
export interface IdentityRbacRoleGrant {
    action: string;
    createdAt: string;
    createdBy: string;
    effect: "allow" | "deny";
    id: string;
    policyVersionId: string;
    resource: string;
    roleKey: string;
    tenantId: string | null;
    traceId: string;
}
export interface IdentityPermissionDenialEvent {
    action: string;
    actorId: string | null;
    at: string;
    id: string;
    immutable: true;
    policyVersionId: string | null;
    reason: string;
    resource: string;
    roleKey: string | null;
    tenantId: string | null;
    traceId: string;
}
export interface IdentityServiceAdminAuditEvent {
    action: string;
    actor: string;
    actorName: string;
    at: string;
    id: string;
    immutable: true;
    reason: string | null;
    result: string;
    severity: "info" | "warning" | "critical";
    target: string;
    tenantId: string | null;
    traceId: string;
    userId: string | null;
}
export interface IdentityServiceAdminAuditExport {
    createdAt: string;
    descriptor: Record<string, unknown>;
    descriptorId: string;
    expiresAt: string;
    filters: Record<string, string>;
    id: string;
    objectKey: string;
    redactionPolicy: string;
    requesterId: string;
    requesterName: string;
    sourceEventIds: string[];
}
export interface IdentityServiceAdminAuditRedaction {
    actor: string;
    actorName: string;
    at: string;
    createdAt: string;
    eventId: string;
    id: string;
    overlay: Record<string, unknown>;
    reason: string;
}
export interface IdentityServiceAdminImpersonationSession {
    auditEventId?: string | null;
    approvalId: string | null;
    banner: string;
    durationMinutes: number;
    expiresAt: string;
    id: string;
    mode: "read_only_by_default" | "break_glass_write";
    startedAt: string;
    stoppedAt: string | null;
    stopAuditEvent: IdentityServiceAdminAuditEvent | null;
    tenantId: string;
    tenantName: string;
    userId: string | null;
    userName: string | null;
}
export declare class ActiveServiceAdminImpersonationError extends Error {
    readonly tenantId: string;
    readonly userId: string | null;
    constructor(tenantId: string, userId: string | null);
}
export declare function isActiveServiceAdminImpersonationConflict(error: unknown): boolean;
export interface IdentityBreakGlassApproval {
    action: string;
    auditEventId: string;
    durationMinutes: number;
    expiresAt: string;
    id: string;
    requestedAt: string;
    status: "pending" | "approved" | "rejected" | "expired";
    target: string;
    tenantId: string | null;
    userId: string | null;
}
export interface IdentityMfaChallenge {
    attempts: number;
    id: string;
    consumedAt: string | null;
    createdAt: string;
    email: string;
    expiresAt: string;
    maxAttempts: number;
    otpHash: string;
}
export interface IdentityAuthInviteToken {
    code: string;
    consumedAt: string | null;
    createdAt: string;
    email: string;
    expiresAt: string;
    id: string;
    tenantId: string;
}
export interface IdentityAuthInviteTokenRecord {
    codeHash: string;
    consumedAt: string | null;
    createdAt: string;
    email: string;
    expiresAt: string;
    id: string;
    tenantId: string;
}
export interface IdentityAuthRecoveryToken {
    consumedAt: string | null;
    createdAt: string;
    email: string;
    expiresAt: string;
    id: string;
    token: string;
}
export interface IdentityAuthRecoveryTokenRecord {
    consumedAt: string | null;
    createdAt: string;
    email: string;
    expiresAt: string;
    id: string;
    tokenHash: string;
}
export interface IdentityPasswordCredential {
    algorithm: "sha256" | "scrypt";
    email: string;
    hash: string;
    subjectId: string;
    updatedAt: string;
    version: number;
}
export interface IdentityPasswordPolicy {
    maxFailedAttempts: number;
    minLength: number;
    requireMfa: boolean;
    scope: string;
    updatedAt: string;
}
export interface IdentityCredentialAuditEvent {
    action: string;
    actor: string;
    at: string;
    id: string;
    immutable: true;
    reason: string;
    result: string;
    subjectId: string;
    traceId: string;
}
export interface IdentityOidcProviderConfig {
    audience: string;
    clientId: string;
    enabled: boolean;
    issuer: string;
    jwksUri: string;
    providerId: string;
    scopes: string[];
    tenantId: string;
    updatedAt: string;
}
export interface IdentityOidcCallbackDescriptor {
    consumedAt: string | null;
    expiresAt: string;
    id: string;
    nonceHash: string;
    providerId: string;
    redirectUri: string;
    requestedAt: string;
    state: string;
    traceId: string;
}
export interface IdentitySamlProviderMetadata {
    acsUrl: string;
    audience: string;
    certificateFingerprint: string;
    enabled: boolean;
    entityId: string;
    providerId: string;
    ssoUrl: string;
    tenantId: string;
    updatedAt: string;
}
export interface IdentitySamlAcsRequestDescriptor {
    acsUrl: string;
    consumedAt: string | null;
    expiresAt: string;
    id: string;
    providerId: string;
    relayState: string;
    requestedAt: string;
    requestId: string;
    traceId: string;
}
export interface IdentitySamlAssertionReplay {
    assertionId: string;
    audience: string;
    expiresAt: string;
    providerId: string;
    receivedAt: string;
    requestId: string;
    subjectId: string;
    traceId: string;
}
export interface IdentityServiceAdminTokenPair {
    accessTokenExpiresAt: string;
    accessTokenHash: string;
    id: string;
    issuedAt: string;
    refreshTokenExpiresAt: string;
    refreshTokenHash: string;
    revokedAt: string | null;
    rotatedAt: string | null;
    sessionId: string;
    subjectId: string;
}
export interface IdentityServiceAdminTokenRotationResult {
    next: IdentityServiceAdminTokenPair;
    previous: IdentityServiceAdminTokenPair;
    status: "rotated" | "duplicate";
}
export interface IdentityServiceAdminTokenRevokeResult {
    idempotencyKey: string;
    token: IdentityServiceAdminTokenPair;
    status: "revoked" | "duplicate";
}
export type MfaChallengeConsumeResult = {
    challenge: IdentityMfaChallenge;
    valid: true;
} | {
    code: "mfa_challenge_attempts_exceeded" | "mfa_challenge_consumed" | "mfa_challenge_expired" | "mfa_challenge_mismatch" | "mfa_challenge_not_found" | "mfa_challenge_required" | "mfa_otp_invalid";
    message: string;
    valid: false;
};
export type InviteTokenConsumeResult = {
    status: "consumed";
    token: IdentityAuthInviteToken;
} | {
    code: "invite_email_mismatch" | "invite_expired" | "invite_not_found";
    message: string;
    status: "denied";
};
export type RecoveryTokenConsumeResult = {
    status: "consumed";
    token: IdentityAuthRecoveryToken;
} | {
    code: "recovery_expired" | "recovery_not_found";
    message: string;
    status: "denied";
};
export type PasswordRecoveryCompletionResult = {
    credential: IdentityPasswordCredential;
    revokedSessions: number;
    revokedTokenPairs: number;
    status: "consumed";
} | {
    code: "recovery_expired" | "recovery_not_found";
    message: string;
    status: "denied";
};
export type OidcCallbackDescriptorConsumeResult = {
    descriptor: IdentityOidcCallbackDescriptor;
    status: "consumed";
} | {
    code: "oidc_callback_expired" | "oidc_callback_not_found" | "oidc_callback_replayed" | "oidc_callback_state_required";
    descriptor?: IdentityOidcCallbackDescriptor;
    message: string;
    status: "expired" | "missing" | "replayed";
};
export type SamlAcsRequestDescriptorConsumeResult = {
    descriptor: IdentitySamlAcsRequestDescriptor;
    status: "consumed";
} | {
    code: "saml_acs_request_expired" | "saml_acs_request_not_found" | "saml_acs_request_replayed" | "saml_acs_request_required";
    descriptor?: IdentitySamlAcsRequestDescriptor;
    message: string;
    status: "expired" | "missing" | "replayed";
};
export interface StoredServiceAdminSession extends ServiceAdminSessionRecord {
    adminEmail: string;
    adminId: string;
    adminName: string;
    authState: "mfa_verified";
    availableOrganizations: IdentityAvailableOrganization[];
    currentTenantId: string;
    role: string;
    tenantScope: string;
}
export interface StoredTenantOperatorSession {
    allowedActions: string[];
    expiresAt: string;
    id: string;
    revokedAt: string | null;
    role: string;
    tenantId: string;
    userEmail: string;
    userId: string;
    userName: string;
}
interface CreateTenantOperatorSessionInput {
    tenantId: string;
    userId: string;
}
export interface CreateTenantOperatorSessionResult {
    accessToken: string;
    expiresAt: string;
    refreshToken: string;
    sessionId: string;
}
interface CreateInviteTokenInput {
    code?: string;
    email: string;
    expiresAt?: string;
    tenantId: string;
}
interface ConsumeInviteTokenInput {
    code: string;
    email: string;
    now?: Date;
}
interface ConsumeRecoveryTokenInput {
    email: string;
    now?: Date;
    token: string;
}
interface CompletePasswordRecoveryInput extends ConsumeRecoveryTokenInput {
    credential: IdentityPasswordCredential;
}
export interface IdentityState {
    authInviteTokens: IdentityAuthInviteTokenRecord[];
    authRecoveryTokens: IdentityAuthRecoveryTokenRecord[];
    breakGlassApprovals: IdentityBreakGlassApproval[];
    credentialAuditEvents: IdentityCredentialAuditEvent[];
    mfaChallenges: IdentityMfaChallenge[];
    oidcCallbackDescriptors: IdentityOidcCallbackDescriptor[];
    oidcProviderConfigs: IdentityOidcProviderConfig[];
    outbox: OutboxEvent[];
    passwordCredentials: IdentityPasswordCredential[];
    passwordPolicies: IdentityPasswordPolicy[];
    permissionDenialEvents: IdentityPermissionDenialEvent[];
    samlAcsRequestDescriptors: IdentitySamlAcsRequestDescriptor[];
    samlAssertionReplays: IdentitySamlAssertionReplay[];
    samlProviderMetadata: IdentitySamlProviderMetadata[];
    serviceAdminImpersonations: IdentityServiceAdminImpersonationSession[];
    serviceAdminSessions: StoredServiceAdminSession[];
    serviceAdminAuditEvents: IdentityServiceAdminAuditEvent[];
    serviceAdminAuditExports: IdentityServiceAdminAuditExport[];
    serviceAdminAuditRedactions: IdentityServiceAdminAuditRedaction[];
    tenantAuditEvents: IdentityTenantAuditEvent[];
    tenantUsers: IdentityTenantUser[];
    tenants: IdentityTenant[];
    permissionRoles: IdentityPermissionRole[];
    privilegedServiceAdminActions: string[];
    rbacPolicyVersions: IdentityRbacPolicyVersion[];
    rbacRoleGrants: IdentityRbacRoleGrant[];
    serviceAdminFeatureFlags: IdentityServiceAdminFeatureFlag[];
    serviceAdminIncidents: IdentityServiceAdminIncident[];
    serviceAdminTariffs: IdentityServiceAdminTariff[];
    serviceAdminTokenPairs: IdentityServiceAdminTokenPair[];
    serviceAdminTokenRotations: IdentityServiceAdminTokenRotationResult[];
    serviceAdminTokenRevocations: IdentityServiceAdminTokenRevokeResult[];
}
type MaybePromise<T> = T | Promise<T>;
export interface IdentityRepositoryPort {
    appendOutbox(event: OutboxEvent): MaybePromise<OutboxEvent>;
    applyServiceAdminUserAction(input: ServiceAdminUserActionInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        user: IdentityTenantUser;
    }>;
    createBreakGlassApproval(input: CreateBreakGlassApprovalInput): MaybePromise<{
        approval: IdentityBreakGlassApproval;
        auditEvent: IdentityServiceAdminAuditEvent;
    }>;
    createInviteToken(input: CreateInviteTokenInput): MaybePromise<IdentityAuthInviteToken>;
    createRecoveryToken(email: string): MaybePromise<IdentityAuthRecoveryToken>;
    decideBreakGlassApproval(input: DecideBreakGlassApprovalInput): MaybePromise<{
        approval: IdentityBreakGlassApproval;
        auditEvent: IdentityServiceAdminAuditEvent;
    }>;
    consumeInviteToken(input: ConsumeInviteTokenInput): MaybePromise<InviteTokenConsumeResult>;
    createServiceAdminImpersonation(input: CreateServiceAdminImpersonationInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        session: IdentityServiceAdminImpersonationSession;
    }>;
    consumeMfaChallenge(input: ConsumeMfaChallengeInput): MaybePromise<MfaChallengeConsumeResult>;
    consumeRecoveryToken(input: ConsumeRecoveryTokenInput): MaybePromise<RecoveryTokenConsumeResult>;
    completePasswordRecovery(input: CompletePasswordRecoveryInput): MaybePromise<PasswordRecoveryCompletionResult>;
    consumeOidcCallbackDescriptor(input: ConsumeOidcCallbackDescriptorInput): MaybePromise<OidcCallbackDescriptorConsumeResult>;
    consumeSamlAcsRequestDescriptor(input: ConsumeSamlAcsRequestDescriptorInput): MaybePromise<SamlAcsRequestDescriptorConsumeResult>;
    createMfaChallenge(input: CreateMfaChallengeInput): MaybePromise<IdentityMfaChallenge>;
    createTenantOperatorSession(input: CreateTenantOperatorSessionInput): MaybePromise<CreateTenantOperatorSessionResult>;
    createServiceAdminSession(input?: CreateServiceAdminSessionInput): MaybePromise<StoredServiceAdminSession>;
    createServiceAdminTokenPair(input: CreateServiceAdminTokenPairInput): MaybePromise<IdentityServiceAdminTokenPair>;
    findActiveServiceAdminImpersonation(input: FindActiveServiceAdminImpersonationInput): MaybePromise<IdentityServiceAdminImpersonationSession | undefined>;
    findBreakGlassApproval(approvalId: string | undefined): MaybePromise<IdentityBreakGlassApproval | undefined>;
    findInviteToken(code: string): MaybePromise<IdentityAuthInviteToken | undefined>;
    findMfaChallenge(challengeId: string | undefined): MaybePromise<IdentityMfaChallenge | undefined>;
    findOidcCallbackDescriptor(state: string): MaybePromise<IdentityOidcCallbackDescriptor | undefined>;
    findOidcProviderConfig(providerId: string): MaybePromise<IdentityOidcProviderConfig | undefined>;
    findPasswordCredentialByEmail(email: string): MaybePromise<IdentityPasswordCredential | undefined>;
    findSamlAcsRequestDescriptor(requestId: string): MaybePromise<IdentitySamlAcsRequestDescriptor | undefined>;
    findSamlAssertionReplay(providerId: string, assertionId: string): MaybePromise<IdentitySamlAssertionReplay | undefined>;
    findSamlProviderMetadata(providerId: string): MaybePromise<IdentitySamlProviderMetadata | undefined>;
    findServiceAdminImpersonation(impersonationId: string | undefined): MaybePromise<IdentityServiceAdminImpersonationSession | undefined>;
    findServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined>;
    findServiceAdminSessionByAccessToken(accessToken: string): MaybePromise<StoredServiceAdminSession | undefined>;
    findTenant(tenantId: string): MaybePromise<IdentityTenant | undefined>;
    findTenantAuditEvents(tenantId: string): MaybePromise<IdentityTenantAuditEvent[]>;
    deleteTenantUser(userId: string): MaybePromise<IdentityTenantUser | undefined>;
    findTenantUser(userId: string | undefined): MaybePromise<IdentityTenantUser | undefined>;
    findTenantUserByEmail(email: string): MaybePromise<IdentityTenantUser | undefined>;
    findTenantUsersByEmail(email: string): MaybePromise<IdentityTenantUser[]>;
    findTenantUsers(tenantId: string): MaybePromise<IdentityTenantUser[]>;
    refreshTenantOperatorSessionPermissions(userId: string): MaybePromise<number>;
    findTenantOperatorSession(sessionId: string | undefined): MaybePromise<StoredTenantOperatorSession | undefined>;
    findTenantOperatorSessionByAccessToken(accessToken: string): MaybePromise<{
        permissions: string[];
        session: StoredTenantOperatorSession;
        user: IdentityTenantUser;
    } | undefined>;
    getActiveRbacPolicyVersion(): MaybePromise<IdentityRbacPolicyVersion | undefined>;
    getPasswordPolicy(scope: string): MaybePromise<IdentityPasswordPolicy | undefined>;
    touchServiceAdminSessionActivity(input: TouchServiceAdminSessionActivityInput): MaybePromise<void>;
    listCredentialAuditEvents(subjectId: string): MaybePromise<IdentityCredentialAuditEvent[]>;
    listPermissionDenialEvents(input?: ListPermissionDenialEventsInput): MaybePromise<IdentityPermissionDenialEvent[]>;
    listServiceAdminAuditEvents(): MaybePromise<IdentityServiceAdminAuditEvent[]>;
    listServiceAdminAuditExports(): MaybePromise<IdentityServiceAdminAuditExport[]>;
    listServiceAdminAuditRedactions(): MaybePromise<IdentityServiceAdminAuditRedaction[]>;
    listTenants(): MaybePromise<IdentityTenant[]>;
    listPermissionRoles(): MaybePromise<IdentityPermissionRole[]>;
    listPrivilegedServiceAdminActions(): MaybePromise<string[]>;
    listRbacRoleGrants(input?: ListRbacRoleGrantsInput): MaybePromise<IdentityRbacRoleGrant[]>;
    listServiceAdminFeatureFlags(): MaybePromise<IdentityServiceAdminFeatureFlag[]>;
    listServiceAdminIncidents(): MaybePromise<IdentityServiceAdminIncident[]>;
    listServiceAdminTariffs(): MaybePromise<IdentityServiceAdminTariff[]>;
    recordCredentialAuditEvent(event: IdentityCredentialAuditEvent): MaybePromise<IdentityCredentialAuditEvent>;
    recordOidcCallbackDescriptor(descriptor: IdentityOidcCallbackDescriptor): MaybePromise<IdentityOidcCallbackDescriptor>;
    recordPermissionDenialEvent(event: IdentityPermissionDenialEvent): MaybePromise<IdentityPermissionDenialEvent>;
    recordRbacRoleGrant(grant: IdentityRbacRoleGrant): MaybePromise<IdentityRbacRoleGrant>;
    recordSamlAcsRequestDescriptor(descriptor: IdentitySamlAcsRequestDescriptor): MaybePromise<IdentitySamlAcsRequestDescriptor>;
    recordSamlAssertionReplay(replay: IdentitySamlAssertionReplay): MaybePromise<IdentitySamlAssertionReplay>;
    recordServiceAdminAuditEvent(event: IdentityServiceAdminAuditEvent): MaybePromise<IdentityServiceAdminAuditEvent>;
    recordServiceAdminAuditExport(exportRecord: IdentityServiceAdminAuditExport): MaybePromise<IdentityServiceAdminAuditExport>;
    recordServiceAdminAuditRedaction(redaction: IdentityServiceAdminAuditRedaction): MaybePromise<IdentityServiceAdminAuditRedaction>;
    removeProvisionedTenant(tenantId: string): MaybePromise<void>;
    saveTenant(tenant: IdentityTenant): MaybePromise<IdentityTenant>;
    saveTenantUser(user: IdentityTenantUser): MaybePromise<IdentityTenantUser>;
    revokeTenantOperatorSession(input: {
        sessionId?: string;
        token?: string;
    }): MaybePromise<boolean>;
    revokeServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined>;
    revokeServiceAdminToken(input: RevokeServiceAdminTokenInput): MaybePromise<IdentityServiceAdminTokenRevokeResult | undefined>;
    rotateServiceAdminRefreshToken(input: RotateServiceAdminRefreshTokenInput): MaybePromise<IdentityServiceAdminTokenRotationResult | undefined>;
    saveRbacPolicyVersion(policyVersion: IdentityRbacPolicyVersion): MaybePromise<IdentityRbacPolicyVersion>;
    saveOidcProviderConfig(config: IdentityOidcProviderConfig): MaybePromise<IdentityOidcProviderConfig>;
    saveSamlProviderMetadata(metadata: IdentitySamlProviderMetadata): MaybePromise<IdentitySamlProviderMetadata>;
    savePasswordCredential(credential: IdentityPasswordCredential): MaybePromise<IdentityPasswordCredential>;
    savePasswordPolicy(policy: IdentityPasswordPolicy): MaybePromise<IdentityPasswordPolicy>;
    stopServiceAdminImpersonation(input: StopServiceAdminImpersonationInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        session: IdentityServiceAdminImpersonationSession;
    }>;
    updateTenantStatus(input: TenantStatusChangeInput): MaybePromise<{
        auditEvent: IdentityTenantAuditEvent;
        outbox: OutboxEvent;
        tenant: IdentityTenant;
    }>;
}
interface CreateServiceAdminSessionInput {
    actorId?: string;
    actorName?: string;
    adminEmail?: string;
    allowedActions?: string[];
    availableOrganizations?: IdentityAvailableOrganization[];
    currentTenantId?: string;
    mfaVerified?: boolean;
    role?: string;
    sessionIdPrefix?: string;
    tenantScope?: string;
    ttlMinutes?: number;
}
interface TouchServiceAdminSessionActivityInput {
    accessToken: string;
    now?: Date;
}
interface CreateServiceAdminTokenPairInput {
    accessTokenExpiresAt: string;
    accessTokenHash: string;
    id: string;
    issuedAt: string;
    refreshTokenExpiresAt: string;
    refreshTokenHash: string;
    sessionId: string;
    subjectId: string;
}
interface RotateServiceAdminRefreshTokenInput {
    idempotencyKey: string;
    nextAccessTokenExpiresAt: string;
    nextAccessTokenHash: string;
    nextRefreshTokenExpiresAt: string;
    nextRefreshTokenHash: string;
    refreshTokenHash: string;
    rotatedAt: string;
}
interface RevokeServiceAdminTokenInput {
    idempotencyKey: string;
    revokedAt: string;
    tokenHash: string;
}
interface ConsumeMfaChallengeInput {
    challengeId?: string;
    email: string;
    now?: Date;
    otpHash: string;
}
interface CreateMfaChallengeInput {
    email: string;
    maxAttempts?: number;
    otpHash: string;
}
interface ConsumeOidcCallbackDescriptorInput {
    now?: Date;
    state?: string;
}
interface ConsumeSamlAcsRequestDescriptorInput {
    now?: Date;
    requestId?: string;
}
interface ListPermissionDenialEventsInput {
    tenantId?: string;
}
interface ListRbacRoleGrantsInput {
    policyVersionId?: string;
    roleKey?: string;
    tenantId?: string | null;
}
interface TenantStatusChangeInput {
    reason: string;
    status: string;
    tenantId: string;
    traceId: string;
}
interface ServiceAdminUserActionInput {
    action: string;
    auditEvent: IdentityServiceAdminAuditEvent;
    changes: Partial<IdentityTenantUser>;
    userId: string;
}
interface CreateServiceAdminImpersonationInput {
    auditEvent: IdentityServiceAdminAuditEvent;
    session: IdentityServiceAdminImpersonationSession;
}
interface FindActiveServiceAdminImpersonationInput {
    now?: Date;
    tenantId: string;
    userId: string | null;
}
interface StopServiceAdminImpersonationInput {
    auditEvent: IdentityServiceAdminAuditEvent;
    impersonationId: string;
    stoppedAt: string;
}
interface CreateBreakGlassApprovalInput {
    approval: IdentityBreakGlassApproval;
    auditEvent: IdentityServiceAdminAuditEvent;
}
interface DecideBreakGlassApprovalInput {
    approvalId: string;
    auditEvent: IdentityServiceAdminAuditEvent;
    status: "approved" | "rejected" | "expired";
}
export declare class IdentityRepository implements IdentityRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): IdentityRepository;
    static useDefault(repository: IdentityRepository): void;
    static inMemory(seed?: IdentityState): IdentityRepository;
    static prisma({ client }: PrismaIdentityRepositoryOptions): IdentityRepository;
    listTenants(): MaybePromise<IdentityTenant[]>;
    findTenant(tenantId: string): MaybePromise<IdentityTenant | undefined>;
    saveTenant(tenant: IdentityTenant): MaybePromise<IdentityTenant>;
    saveTenantUser(user: IdentityTenantUser): MaybePromise<IdentityTenantUser>;
    findTenantAuditEvents(tenantId: string): MaybePromise<IdentityTenantAuditEvent[]>;
    findTenantUser(userId: string | undefined): MaybePromise<IdentityTenantUser | undefined>;
    findTenantUserByEmail(email: string): MaybePromise<IdentityTenantUser | undefined>;
    deleteTenantUser(userId: string): MaybePromise<IdentityTenantUser | undefined>;
    refreshTenantOperatorSessionPermissions(userId: string): MaybePromise<number>;
    findTenantUsersByEmail(email: string): MaybePromise<IdentityTenantUser[]>;
    findTenantUsers(tenantId: string): MaybePromise<IdentityTenantUser[]>;
    listServiceAdminAuditEvents(): MaybePromise<IdentityServiceAdminAuditEvent[]>;
    listServiceAdminAuditExports(): MaybePromise<IdentityServiceAdminAuditExport[]>;
    listServiceAdminAuditRedactions(): MaybePromise<IdentityServiceAdminAuditRedaction[]>;
    listPermissionRoles(): MaybePromise<IdentityPermissionRole[]>;
    listPrivilegedServiceAdminActions(): MaybePromise<string[]>;
    listServiceAdminTariffs(): MaybePromise<IdentityServiceAdminTariff[]>;
    listServiceAdminIncidents(): MaybePromise<IdentityServiceAdminIncident[]>;
    listServiceAdminFeatureFlags(): MaybePromise<IdentityServiceAdminFeatureFlag[]>;
    getActiveRbacPolicyVersion(): MaybePromise<IdentityRbacPolicyVersion | undefined>;
    saveRbacPolicyVersion(policyVersion: IdentityRbacPolicyVersion): MaybePromise<IdentityRbacPolicyVersion>;
    recordRbacRoleGrant(grant: IdentityRbacRoleGrant): MaybePromise<IdentityRbacRoleGrant>;
    listRbacRoleGrants(input?: ListRbacRoleGrantsInput): MaybePromise<IdentityRbacRoleGrant[]>;
    recordPermissionDenialEvent(event: IdentityPermissionDenialEvent): MaybePromise<IdentityPermissionDenialEvent>;
    listPermissionDenialEvents(input?: ListPermissionDenialEventsInput): MaybePromise<IdentityPermissionDenialEvent[]>;
    recordServiceAdminAuditEvent(event: IdentityServiceAdminAuditEvent): MaybePromise<IdentityServiceAdminAuditEvent>;
    recordServiceAdminAuditExport(exportRecord: IdentityServiceAdminAuditExport): MaybePromise<IdentityServiceAdminAuditExport>;
    recordServiceAdminAuditRedaction(redaction: IdentityServiceAdminAuditRedaction): MaybePromise<IdentityServiceAdminAuditRedaction>;
    removeProvisionedTenant(tenantId: string): MaybePromise<void>;
    applyServiceAdminUserAction(input: ServiceAdminUserActionInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        user: IdentityTenantUser;
    }>;
    createServiceAdminImpersonation(input: CreateServiceAdminImpersonationInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        session: IdentityServiceAdminImpersonationSession;
    }>;
    findActiveServiceAdminImpersonation(input: FindActiveServiceAdminImpersonationInput): MaybePromise<IdentityServiceAdminImpersonationSession | undefined>;
    findServiceAdminImpersonation(impersonationId: string | undefined): MaybePromise<IdentityServiceAdminImpersonationSession | undefined>;
    stopServiceAdminImpersonation(input: StopServiceAdminImpersonationInput): MaybePromise<{
        auditEvent: IdentityServiceAdminAuditEvent;
        session: IdentityServiceAdminImpersonationSession;
    }>;
    createBreakGlassApproval(input: CreateBreakGlassApprovalInput): MaybePromise<{
        approval: IdentityBreakGlassApproval;
        auditEvent: IdentityServiceAdminAuditEvent;
    }>;
    findBreakGlassApproval(approvalId: string | undefined): MaybePromise<IdentityBreakGlassApproval | undefined>;
    decideBreakGlassApproval(input: DecideBreakGlassApprovalInput): MaybePromise<{
        approval: IdentityBreakGlassApproval;
        auditEvent: IdentityServiceAdminAuditEvent;
    }>;
    updateTenantStatus(input: TenantStatusChangeInput): MaybePromise<{
        auditEvent: IdentityTenantAuditEvent;
        outbox: OutboxEvent;
        tenant: IdentityTenant;
    }>;
    createMfaChallenge(input: CreateMfaChallengeInput): MaybePromise<IdentityMfaChallenge>;
    createInviteToken(input: CreateInviteTokenInput): MaybePromise<IdentityAuthInviteToken>;
    createRecoveryToken(email: string): MaybePromise<IdentityAuthRecoveryToken>;
    createTenantOperatorSession(input: CreateTenantOperatorSessionInput): MaybePromise<CreateTenantOperatorSessionResult>;
    consumeInviteToken(input: ConsumeInviteTokenInput): MaybePromise<InviteTokenConsumeResult>;
    consumeMfaChallenge(input: ConsumeMfaChallengeInput): MaybePromise<MfaChallengeConsumeResult>;
    consumeRecoveryToken(input: ConsumeRecoveryTokenInput): MaybePromise<RecoveryTokenConsumeResult>;
    completePasswordRecovery(input: CompletePasswordRecoveryInput): MaybePromise<PasswordRecoveryCompletionResult>;
    consumeOidcCallbackDescriptor(input: ConsumeOidcCallbackDescriptorInput): MaybePromise<OidcCallbackDescriptorConsumeResult>;
    consumeSamlAcsRequestDescriptor(input: ConsumeSamlAcsRequestDescriptorInput): MaybePromise<SamlAcsRequestDescriptorConsumeResult>;
    findInviteToken(code: string): MaybePromise<IdentityAuthInviteToken | undefined>;
    findMfaChallenge(challengeId: string | undefined): MaybePromise<IdentityMfaChallenge | undefined>;
    findPasswordCredentialByEmail(email: string): MaybePromise<IdentityPasswordCredential | undefined>;
    savePasswordCredential(credential: IdentityPasswordCredential): MaybePromise<IdentityPasswordCredential>;
    getPasswordPolicy(scope: string): MaybePromise<IdentityPasswordPolicy | undefined>;
    savePasswordPolicy(policy: IdentityPasswordPolicy): MaybePromise<IdentityPasswordPolicy>;
    recordCredentialAuditEvent(event: IdentityCredentialAuditEvent): MaybePromise<IdentityCredentialAuditEvent>;
    listCredentialAuditEvents(subjectId: string): MaybePromise<IdentityCredentialAuditEvent[]>;
    saveOidcProviderConfig(config: IdentityOidcProviderConfig): MaybePromise<IdentityOidcProviderConfig>;
    findOidcProviderConfig(providerId: string): MaybePromise<IdentityOidcProviderConfig | undefined>;
    recordOidcCallbackDescriptor(descriptor: IdentityOidcCallbackDescriptor): MaybePromise<IdentityOidcCallbackDescriptor>;
    findOidcCallbackDescriptor(state: string): MaybePromise<IdentityOidcCallbackDescriptor | undefined>;
    saveSamlProviderMetadata(metadata: IdentitySamlProviderMetadata): MaybePromise<IdentitySamlProviderMetadata>;
    findSamlProviderMetadata(providerId: string): MaybePromise<IdentitySamlProviderMetadata | undefined>;
    recordSamlAcsRequestDescriptor(descriptor: IdentitySamlAcsRequestDescriptor): MaybePromise<IdentitySamlAcsRequestDescriptor>;
    findSamlAcsRequestDescriptor(requestId: string): MaybePromise<IdentitySamlAcsRequestDescriptor | undefined>;
    recordSamlAssertionReplay(replay: IdentitySamlAssertionReplay): MaybePromise<IdentitySamlAssertionReplay>;
    findSamlAssertionReplay(providerId: string, assertionId: string): MaybePromise<IdentitySamlAssertionReplay | undefined>;
    createServiceAdminSession(input?: CreateServiceAdminSessionInput): MaybePromise<StoredServiceAdminSession>;
    createServiceAdminTokenPair(input: CreateServiceAdminTokenPairInput): MaybePromise<IdentityServiceAdminTokenPair>;
    findServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined>;
    findServiceAdminSessionByAccessToken(accessToken: string): MaybePromise<StoredServiceAdminSession | undefined>;
    findTenantOperatorSession(sessionId: string | undefined): MaybePromise<StoredTenantOperatorSession | undefined>;
    findTenantOperatorSessionByAccessToken(accessToken: string): MaybePromise<{
        permissions: string[];
        session: StoredTenantOperatorSession;
        user: IdentityTenantUser;
    } | undefined>;
    touchServiceAdminSessionActivity(input: TouchServiceAdminSessionActivityInput): MaybePromise<void>;
    revokeServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined>;
    revokeTenantOperatorSession(input: {
        sessionId?: string;
        token?: string;
    }): MaybePromise<boolean>;
    rotateServiceAdminRefreshToken(input: RotateServiceAdminRefreshTokenInput): MaybePromise<IdentityServiceAdminTokenRotationResult | undefined>;
    revokeServiceAdminToken(input: RevokeServiceAdminTokenInput): MaybePromise<IdentityServiceAdminTokenRevokeResult | undefined>;
    appendOutbox(event: OutboxEvent): MaybePromise<OutboxEvent>;
}
export interface PrismaIdentityRepositoryOptions {
    client: PrismaIdentityClient;
}
export interface PrismaIdentityClient extends PrismaIdentityDelegates {
    $executeRawUnsafe?(query: string, ...values: unknown[]): Promise<unknown>;
    $transaction<TResult>(operation: (client: PrismaIdentityTransactionalClient) => Promise<TResult>): Promise<TResult>;
}
type PrismaIdentityTransactionalClient = PrismaIdentityDelegates & PrismaRawSqlClient;
interface PrismaRawSqlClient {
    $executeRawUnsafe?(query: string, ...values: unknown[]): Promise<unknown>;
}
interface PrismaIdentityDelegates {
    authInviteToken: {
        findUnique(input: {
            where: {
                codeHash: string;
            };
        }): Promise<PrismaAuthInviteTokenRow | null>;
        updateMany(input: {
            data: {
                consumedAt: Date;
            };
            where: {
                consumedAt: null;
                id: string;
            };
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaAuthInviteTokenCreateInput;
            update: PrismaAuthInviteTokenUpdateInput;
            where: {
                codeHash: string;
            };
        }): Promise<PrismaAuthInviteTokenRow>;
    };
    authRecoveryToken: {
        findUnique(input: {
            where: {
                tokenHash: string;
            };
        }): Promise<PrismaAuthRecoveryTokenRow | null>;
        updateMany(input: {
            data: {
                consumedAt: Date;
            };
            where: {
                consumedAt: null;
                id: string;
            };
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaAuthRecoveryTokenCreateInput;
            update: PrismaAuthRecoveryTokenUpdateInput;
            where: {
                tokenHash: string;
            };
        }): Promise<PrismaAuthRecoveryTokenRow>;
    };
    breakGlassApproval: {
        create(input: {
            data: PrismaBreakGlassApprovalCreateInput;
        }): Promise<PrismaBreakGlassApprovalRow>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaBreakGlassApprovalRow | null>;
        updateMany(input: {
            data: PrismaBreakGlassApprovalUpdateInput;
            where: {
                id: string;
                status: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    mfaChallenge: {
        create(input: {
            data: PrismaMfaChallengeCreateInput;
        }): Promise<PrismaMfaChallengeRow>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaMfaChallengeRow | null>;
        updateMany(input: {
            data: {
                attempts?: {
                    increment: number;
                };
                consumedAt?: Date;
            };
            where: {
                attempts?: number;
                consumedAt: null;
                id: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    outboxEvent: {
        create(input: {
            data: PrismaOutboxEventCreateInput;
        }): Promise<unknown>;
    };
    oidcCallbackDescriptor: {
        create(input: {
            data: PrismaOidcCallbackDescriptorCreateInput;
        }): Promise<PrismaOidcCallbackDescriptorRow>;
        findUnique(input: {
            where: {
                id: string;
            };
        } | {
            where: {
                state: string;
            };
        }): Promise<PrismaOidcCallbackDescriptorRow | null>;
        updateMany(input: {
            data: {
                consumedAt: Date;
            };
            where: {
                consumedAt: null;
                state: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    oidcProviderConfig: {
        findUnique(input: {
            where: {
                providerId: string;
            };
        }): Promise<PrismaOidcProviderConfigRow | null>;
        upsert(input: {
            create: PrismaOidcProviderConfigCreateInput;
            update: PrismaOidcProviderConfigUpdateInput;
            where: {
                providerId: string;
            };
        }): Promise<PrismaOidcProviderConfigRow>;
    };
    samlAcsRequestDescriptor: {
        create(input: {
            data: PrismaSamlAcsRequestDescriptorCreateInput;
        }): Promise<PrismaSamlAcsRequestDescriptorRow>;
        findUnique(input: {
            where: {
                id: string;
            };
        } | {
            where: {
                relayState: string;
            };
        } | {
            where: {
                requestId: string;
            };
        }): Promise<PrismaSamlAcsRequestDescriptorRow | null>;
        updateMany(input: {
            data: {
                consumedAt: Date;
            };
            where: {
                consumedAt: null;
                requestId: string;
            };
        }): Promise<{
            count: number;
        }>;
    };
    samlAssertionReplay: {
        create(input: {
            data: PrismaSamlAssertionReplayCreateInput;
        }): Promise<PrismaSamlAssertionReplayRow>;
        findUnique(input: {
            where: {
                providerId_assertionId: {
                    assertionId: string;
                    providerId: string;
                };
            };
        }): Promise<PrismaSamlAssertionReplayRow | null>;
    };
    samlProviderMetadata: {
        findUnique(input: {
            where: {
                providerId: string;
            };
        }): Promise<PrismaSamlProviderMetadataRow | null>;
        upsert(input: {
            create: PrismaSamlProviderMetadataCreateInput;
            update: PrismaSamlProviderMetadataUpdateInput;
            where: {
                providerId: string;
            };
        }): Promise<PrismaSamlProviderMetadataRow>;
    };
    credentialAuditEvent: {
        create(input: {
            data: PrismaCredentialAuditEventCreateInput;
        }): Promise<PrismaCredentialAuditEventRow>;
        findMany(input: {
            orderBy: {
                at: "desc";
            };
            where: {
                subjectId: string;
            };
        }): Promise<PrismaCredentialAuditEventRow[]>;
    };
    passwordCredential: {
        deleteMany(input: {
            where: {
                email?: string;
                subjectId?: {
                    in: string[];
                };
            };
        }): Promise<{
            count: number;
        }>;
        findUnique(input: {
            where: {
                email: string;
            };
        }): Promise<PrismaPasswordCredentialRow | null>;
        upsert(input: {
            create: PrismaPasswordCredentialCreateInput;
            update: PrismaPasswordCredentialUpdateInput;
            where: {
                email: string;
            };
        }): Promise<PrismaPasswordCredentialRow>;
    };
    passwordPolicy: {
        findUnique(input: {
            where: {
                scope: string;
            };
        }): Promise<PrismaPasswordPolicyRow | null>;
        upsert(input: {
            create: PrismaPasswordPolicyCreateInput;
            update: PrismaPasswordPolicyUpdateInput;
            where: {
                scope: string;
            };
        }): Promise<PrismaPasswordPolicyRow>;
    };
    permissionRole: {
        findMany(input: {
            orderBy: {
                key: "asc";
            };
        }): Promise<PrismaPermissionRoleRow[]>;
    };
    rbacPolicyVersion: {
        findFirst(input: {
            orderBy: Array<{
                activatedAt: "desc";
            } | {
                createdAt: "desc";
            } | {
                id: "desc";
            }>;
            where: {
                status: string;
            };
        }): Promise<PrismaRbacPolicyVersionRow | null>;
        updateMany(input: {
            data: {
                status: "retired";
            };
            where: {
                id: {
                    not: string;
                };
                status: "active";
            };
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaRbacPolicyVersionCreateInput;
            update: PrismaRbacPolicyVersionCreateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaRbacPolicyVersionRow>;
    };
    rbacRoleGrant: {
        create(input: {
            data: PrismaRbacRoleGrantCreateInput;
        }): Promise<PrismaRbacRoleGrantRow>;
        deleteMany(input: {
            where: {
                tenantId: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            where: {
                policyVersionId?: string;
                roleKey?: string;
                tenantId?: string | null;
            };
        }): Promise<PrismaRbacRoleGrantRow[]>;
    };
    permissionDenialEvent: {
        create(input: {
            data: PrismaPermissionDenialEventCreateInput;
        }): Promise<PrismaPermissionDenialEventRow>;
        findMany(input: {
            orderBy: {
                at: "desc";
            };
            where?: {
                tenantId?: string;
            };
        }): Promise<PrismaPermissionDenialEventRow[]>;
    };
    serviceAdminSession: {
        create(input: {
            data: PrismaServiceAdminSessionCreateInput;
        }): Promise<PrismaServiceAdminSessionRow>;
        deleteMany(input: {
            where: {
                tenantScope: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            where: {
                adminEmail: string;
                revokedAt?: null;
            };
        }): Promise<PrismaServiceAdminSessionRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaServiceAdminSessionRow | null>;
        update(input: {
            data: {
                expiresAt?: Date;
                revokedAt?: Date;
            };
            where: {
                id: string;
            };
        }): Promise<PrismaServiceAdminSessionRow>;
        updateMany(input: {
            data: {
                allowedActions?: string[];
                revokedAt?: Date;
                role?: string;
            };
            where: {
                adminId?: string;
                id?: {
                    in: string[];
                } | {
                    startsWith: string;
                };
                revokedAt: null;
            };
        }): Promise<{
            count: number;
        }>;
    };
    serviceAdminTokenPair: {
        create(input: {
            data: PrismaServiceAdminTokenPairCreateInput;
        }): Promise<PrismaServiceAdminTokenPairRow>;
        findFirst(input: PrismaServiceAdminTokenPairFindFirstInput): Promise<PrismaServiceAdminTokenPairRow | null>;
        update(input: {
            data: PrismaServiceAdminTokenPairUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaServiceAdminTokenPairRow>;
        updateMany(input: {
            data: {
                revokedAt: Date;
            };
            where: {
                revokedAt: null;
                sessionId: {
                    in: string[];
                };
            };
        }): Promise<{
            count: number;
        }>;
    };
    serviceAdminTokenRevocation: {
        create(input: {
            data: PrismaServiceAdminTokenRevocationCreateInput;
        }): Promise<PrismaServiceAdminTokenRevocationRow>;
        findUnique(input: PrismaServiceAdminTokenRevocationFindUniqueInput): Promise<PrismaServiceAdminTokenRevocationRowWithPair | null>;
    };
    serviceAdminTokenRotation: {
        create(input: {
            data: PrismaServiceAdminTokenRotationCreateInput;
        }): Promise<PrismaServiceAdminTokenRotationRow>;
        findUnique(input: PrismaServiceAdminTokenRotationFindUniqueInput): Promise<PrismaServiceAdminTokenRotationRowWithPairs | null>;
    };
    serviceAdminAuditEvent: {
        create(input: {
            data: PrismaServiceAdminAuditEventCreateInput;
        }): Promise<PrismaServiceAdminAuditEventRow>;
        deleteMany(input: {
            where: {
                tenantId: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            orderBy: {
                at: "desc";
            };
        }): Promise<PrismaServiceAdminAuditEventRow[]>;
    };
    serviceAdminAuditExport: {
        create(input: {
            data: PrismaServiceAdminAuditExportCreateInput;
        }): Promise<PrismaServiceAdminAuditExportRow>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaServiceAdminAuditExportRow[]>;
    };
    serviceAdminAuditRedaction: {
        create(input: {
            data: PrismaServiceAdminAuditRedactionCreateInput;
        }): Promise<PrismaServiceAdminAuditRedactionRow>;
        findMany(input: {
            orderBy: {
                createdAt: "desc";
            };
        }): Promise<PrismaServiceAdminAuditRedactionRow[]>;
    };
    serviceAdminImpersonation: {
        create(input: {
            data: PrismaServiceAdminImpersonationCreateInput;
        }): Promise<PrismaServiceAdminImpersonationRow>;
        findFirst(input: {
            where: {
                expiresAt: {
                    gt: Date;
                };
                stoppedAt: null;
                tenantId: string;
                userId: string | null;
            };
        }): Promise<PrismaServiceAdminImpersonationRow | null>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaServiceAdminImpersonationRow | null>;
        update(input: {
            data: PrismaServiceAdminImpersonationUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaServiceAdminImpersonationRow>;
    };
    tenant: {
        create(input: {
            data: PrismaTenantCreateInput;
        }): Promise<PrismaTenantRow>;
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
        }): Promise<PrismaTenantRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaTenantRow | null>;
        update(input: {
            data: PrismaTenantUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaTenantRow>;
    };
    tenantAuditEvent: {
        create(input: {
            data: PrismaTenantAuditEventCreateInput;
        }): Promise<PrismaTenantAuditEventRow>;
        findMany(input: {
            orderBy: {
                at: "desc";
            };
            where: {
                tenantId: string;
            };
        }): Promise<PrismaTenantAuditEventRow[]>;
    };
    tenantUser: {
        create(input: {
            data: PrismaTenantUserCreateInput;
        }): Promise<PrismaTenantUserRow>;
        deleteMany(input: {
            where: {
                id: string;
            };
        }): Promise<{
            count: number;
        }>;
        findFirst(input: {
            where: {
                email: string;
            };
        }): Promise<PrismaTenantUserRow | null>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaTenantUserRow | null>;
        findMany(input: {
            orderBy: {
                name: "asc";
            } | Array<{
                tenantId: "asc";
            } | {
                id: "asc";
            }>;
            where: {
                email?: string;
                tenantId?: string;
            };
        }): Promise<PrismaTenantUserRow[]>;
        update(input: {
            data: PrismaTenantUserUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaTenantUserRow>;
    };
}
interface PrismaAuthInviteTokenRow {
    codeHash: string;
    consumedAt: Date | null;
    createdAt: Date;
    email: string;
    expiresAt: Date;
    id: string;
    tenantId: string;
}
interface PrismaAuthInviteTokenCreateInput extends PrismaAuthInviteTokenRow {
}
type PrismaAuthInviteTokenUpdateInput = Omit<PrismaAuthInviteTokenCreateInput, "createdAt" | "id">;
interface PrismaAuthRecoveryTokenRow {
    consumedAt: Date | null;
    createdAt: Date;
    email: string;
    expiresAt: Date;
    id: string;
    tokenHash: string;
}
interface PrismaAuthRecoveryTokenCreateInput extends PrismaAuthRecoveryTokenRow {
}
type PrismaAuthRecoveryTokenUpdateInput = Omit<PrismaAuthRecoveryTokenCreateInput, "createdAt" | "id">;
interface PrismaTenantRow {
    healthScore: number | null;
    id: string;
    metadata?: unknown;
    name: string;
    status: string;
}
interface PrismaTenantCreateInput {
    healthScore: number;
    id: string;
    metadata: Record<string, unknown>;
    name: string;
    status: string;
}
interface PrismaTenantUpdateInput {
    healthScore?: number;
    metadata?: Record<string, unknown>;
    name?: string;
    status?: string;
}
interface PrismaTenantAuditEventRow {
    action: string;
    actor: string;
    at: Date | string;
    id: string;
    immutable?: boolean;
    reason: string | null;
    result: string;
    severity: string;
    target: string;
    tenantId: string;
    traceId: string;
}
interface PrismaTenantUserRow {
    device: string;
    email: string;
    id: string;
    inviteStatus: string;
    lastActiveAt: Date | string | null;
    metadata?: unknown;
    mfa: string;
    name: string;
    risk: string;
    role: string;
    sessions: number;
    status: string;
    supportNotes: string;
    tenantId: string;
}
interface PrismaTenantUserCreateInput {
    device: string;
    email: string;
    id: string;
    inviteStatus: string;
    lastActiveAt: Date | null;
    metadata: Record<string, unknown>;
    mfa: string;
    name: string;
    risk: string;
    role: string;
    sessions: number;
    status: string;
    supportNotes: string;
    tenantId: string;
}
interface PrismaServiceAdminAuditEventRow {
    action: string;
    actor: string;
    actorName: string;
    at: Date | string;
    id: string;
    immutable: boolean;
    reason: string | null;
    result: string;
    severity: string;
    target: string;
    tenantId: string | null;
    traceId: string;
    userId: string | null;
}
interface PrismaServiceAdminAuditExportRow {
    createdAt: Date | string;
    descriptor: unknown;
    descriptorId: string;
    expiresAt: Date | string;
    filters: unknown;
    id: string;
    objectKey: string;
    redactionPolicy: string;
    requesterId: string;
    requesterName: string;
    sourceEventIds: unknown;
}
interface PrismaServiceAdminAuditRedactionRow {
    actor: string;
    actorName: string;
    at: Date | string;
    createdAt: Date | string;
    eventId: string;
    id: string;
    overlay: unknown;
    reason: string;
}
interface PrismaServiceAdminImpersonationRow {
    auditEventId?: string | null;
    approvalId: string | null;
    banner: string;
    durationMinutes: number;
    expiresAt: Date | string;
    id: string;
    mode: string;
    startedAt: Date | string;
    stoppedAt: Date | string | null;
    stopAuditEvent: unknown;
    tenantId: string;
    tenantName: string;
    userId: string | null;
    userName: string | null;
}
interface PrismaBreakGlassApprovalRow {
    action: string;
    auditEventId: string;
    durationMinutes: number;
    expiresAt: Date | string;
    id: string;
    requestedAt: Date | string;
    status: string;
    target: string;
    tenantId: string | null;
    userId: string | null;
}
interface PrismaPermissionRoleRow {
    actions: string[];
    aliases: string[];
    description: string | null;
    groupIds: string[];
    key: string;
    metadata?: unknown;
}
interface PrismaRbacPolicyVersionRow {
    activatedAt: Date | string | null;
    checksum: string;
    createdAt: Date | string;
    createdBy: string;
    description: string;
    id: string;
    status: string;
    version: string;
}
interface PrismaRbacRoleGrantRow {
    action: string;
    createdAt: Date | string;
    createdBy: string;
    effect: string;
    id: string;
    policyVersionId: string;
    resource: string;
    roleKey: string;
    tenantId: string | null;
    traceId: string;
}
interface PrismaPermissionDenialEventRow {
    action: string;
    actorId: string | null;
    at: Date | string;
    id: string;
    immutable: boolean;
    policyVersionId: string | null;
    reason: string;
    resource: string;
    roleKey: string | null;
    tenantId: string | null;
    traceId: string;
}
interface PrismaMfaChallengeRow {
    attempts: number;
    consumedAt: Date | string | null;
    createdAt: Date | string;
    email: string;
    expiresAt: Date | string;
    id: string;
    maxAttempts: number;
    otpHash: string;
}
interface PrismaPasswordCredentialRow {
    algorithm: string;
    email: string;
    hash: string;
    subjectId: string;
    updatedAt: Date | string;
    version: number;
}
interface PrismaPasswordPolicyRow {
    maxFailedAttempts: number;
    minLength: number;
    requireMfa: boolean;
    scope: string;
    updatedAt: Date | string;
}
interface PrismaCredentialAuditEventRow {
    action: string;
    actor: string;
    at: Date | string;
    id: string;
    immutable: boolean;
    reason: string;
    result: string;
    subjectId: string;
    traceId: string;
}
interface PrismaOidcProviderConfigRow {
    audience: string;
    clientId: string;
    enabled: boolean;
    issuer: string;
    jwksUri: string;
    providerId: string;
    scopes: string[];
    tenantId: string;
    updatedAt: Date | string;
}
interface PrismaOidcCallbackDescriptorRow {
    consumedAt: Date | string | null;
    expiresAt: Date | string;
    id: string;
    nonceHash: string;
    providerId: string;
    redirectUri: string;
    requestedAt: Date | string;
    state: string;
    traceId: string;
}
interface PrismaSamlProviderMetadataRow {
    acsUrl: string;
    audience: string;
    certificateFingerprint: string;
    enabled: boolean;
    entityId: string;
    providerId: string;
    ssoUrl: string;
    tenantId: string;
    updatedAt: Date | string;
}
interface PrismaSamlAcsRequestDescriptorRow {
    acsUrl: string;
    consumedAt: Date | string | null;
    expiresAt: Date | string;
    id: string;
    providerId: string;
    relayState: string;
    requestedAt: Date | string;
    requestId: string;
    traceId: string;
}
interface PrismaSamlAssertionReplayRow {
    assertionId: string;
    audience: string;
    expiresAt: Date | string;
    providerId: string;
    receivedAt: Date | string;
    requestId: string;
    subjectId: string;
    traceId: string;
}
interface PrismaServiceAdminSessionRow {
    actorId: string;
    actorName: string;
    adminEmail: string;
    adminId: string;
    adminName: string;
    allowedActions: string[];
    authState: "mfa_verified";
    availableOrganizations: unknown;
    currentTenantId: string;
    expiresAt: Date | string;
    id: string;
    mfaVerifiedAt: Date | string | null;
    revokedAt?: Date | string | null;
    role: string;
    tenantScope: string;
}
interface PrismaServiceAdminTokenPairRow {
    accessTokenExpiresAt: Date | string;
    accessTokenHash: string;
    id: string;
    issuedAt: Date | string;
    refreshTokenExpiresAt: Date | string;
    refreshTokenHash: string;
    revokedAt: Date | string | null;
    rotatedAt: Date | string | null;
    sessionId: string;
    subjectId: string;
}
interface PrismaServiceAdminTokenRevocationRow {
    idempotencyKey: string;
    revokedAt: Date | string;
    tokenHash: string;
    tokenPairId: string;
}
interface PrismaServiceAdminTokenRevocationRowWithPair extends PrismaServiceAdminTokenRevocationRow {
    tokenPair: PrismaServiceAdminTokenPairRow;
}
interface PrismaServiceAdminTokenRotationRow {
    idempotencyKey: string;
    nextTokenPairId: string;
    previousTokenPairId: string;
    rotatedAt: Date | string;
}
interface PrismaServiceAdminTokenRotationRowWithPairs extends PrismaServiceAdminTokenRotationRow {
    nextTokenPair: PrismaServiceAdminTokenPairRow;
    previousTokenPair: PrismaServiceAdminTokenPairRow;
}
interface PrismaMfaChallengeCreateInput {
    attempts: number;
    consumedAt: Date | null;
    createdAt: Date;
    email: string;
    expiresAt: Date;
    id: string;
    maxAttempts: number;
    otpHash: string;
}
interface PrismaServiceAdminSessionCreateInput {
    actorId: string;
    actorName: string;
    adminEmail: string;
    adminId: string;
    adminName: string;
    allowedActions: string[];
    authState: "mfa_verified";
    availableOrganizations: IdentityAvailableOrganization[];
    currentTenantId: string;
    expiresAt: Date;
    id: string;
    mfaVerifiedAt: Date | null;
    revokedAt: Date | null;
    role: string;
    tenantScope: string;
}
interface PrismaServiceAdminTokenPairCreateInput {
    accessTokenExpiresAt: Date;
    accessTokenHash: string;
    id: string;
    issuedAt: Date;
    refreshTokenExpiresAt: Date;
    refreshTokenHash: string;
    revokedAt: Date | null;
    rotatedAt: Date | null;
    sessionId: string;
    subjectId: string;
}
interface PrismaServiceAdminTokenPairUpdateInput {
    accessTokenExpiresAt?: Date;
    revokedAt?: Date;
    rotatedAt?: Date;
}
interface PrismaServiceAdminTokenRotationCreateInput {
    idempotencyKey: string;
    nextTokenPairId: string;
    previousTokenPairId: string;
    rotatedAt: Date;
}
interface PrismaServiceAdminTokenRevocationCreateInput {
    idempotencyKey: string;
    revokedAt: Date;
    tokenHash: string;
    tokenPairId: string;
}
interface PrismaServiceAdminTokenPairFindFirstInput {
    orderBy?: {
        issuedAt: "asc" | "desc";
    };
    where: Record<string, unknown>;
}
interface PrismaServiceAdminTokenRotationFindUniqueInput {
    include: {
        nextTokenPair: true;
        previousTokenPair: true;
    };
    where: {
        idempotencyKey: string;
    };
}
interface PrismaServiceAdminTokenRevocationFindUniqueInput {
    include: {
        tokenPair: true;
    };
    where: {
        idempotencyKey: string;
    };
}
interface PrismaPasswordCredentialCreateInput {
    algorithm: string;
    email: string;
    hash: string;
    subjectId: string;
    updatedAt: Date;
    version: number;
}
type PrismaPasswordCredentialUpdateInput = PrismaPasswordCredentialCreateInput;
interface PrismaPasswordPolicyCreateInput {
    maxFailedAttempts: number;
    minLength: number;
    requireMfa: boolean;
    scope: string;
    updatedAt: Date;
}
type PrismaPasswordPolicyUpdateInput = PrismaPasswordPolicyCreateInput;
interface PrismaCredentialAuditEventCreateInput {
    action: string;
    actor: string;
    at: Date;
    id: string;
    immutable: boolean;
    reason: string;
    result: string;
    subjectId: string;
    traceId: string;
}
interface PrismaRbacPolicyVersionCreateInput {
    activatedAt: Date | null;
    checksum: string;
    createdAt: Date;
    createdBy: string;
    description: string;
    id: string;
    status: string;
    version: string;
}
interface PrismaRbacRoleGrantCreateInput {
    action: string;
    createdAt: Date;
    createdBy: string;
    effect: string;
    id: string;
    policyVersionId: string;
    resource: string;
    roleKey: string;
    tenantId: string | null;
    traceId: string;
}
interface PrismaPermissionDenialEventCreateInput {
    action: string;
    actorId: string | null;
    at: Date;
    id: string;
    immutable: boolean;
    policyVersionId: string | null;
    reason: string;
    resource: string;
    roleKey: string | null;
    tenantId: string | null;
    traceId: string;
}
interface PrismaOidcProviderConfigCreateInput {
    audience: string;
    clientId: string;
    enabled: boolean;
    issuer: string;
    jwksUri: string;
    providerId: string;
    scopes: string[];
    tenantId: string;
    updatedAt: Date;
}
type PrismaOidcProviderConfigUpdateInput = PrismaOidcProviderConfigCreateInput;
interface PrismaOidcCallbackDescriptorCreateInput {
    consumedAt: Date | null;
    expiresAt: Date;
    id: string;
    nonceHash: string;
    providerId: string;
    redirectUri: string;
    requestedAt: Date;
    state: string;
    traceId: string;
}
interface PrismaSamlProviderMetadataCreateInput {
    acsUrl: string;
    audience: string;
    certificateFingerprint: string;
    enabled: boolean;
    entityId: string;
    providerId: string;
    ssoUrl: string;
    tenantId: string;
    updatedAt: Date;
}
type PrismaSamlProviderMetadataUpdateInput = PrismaSamlProviderMetadataCreateInput;
interface PrismaSamlAcsRequestDescriptorCreateInput {
    acsUrl: string;
    consumedAt: Date | null;
    expiresAt: Date;
    id: string;
    providerId: string;
    relayState: string;
    requestedAt: Date;
    requestId: string;
    traceId: string;
}
interface PrismaSamlAssertionReplayCreateInput {
    assertionId: string;
    audience: string;
    expiresAt: Date;
    providerId: string;
    receivedAt: Date;
    requestId: string;
    subjectId: string;
    traceId: string;
}
interface PrismaTenantAuditEventCreateInput {
    action: string;
    actor: string;
    at: Date;
    id: string;
    immutable: boolean;
    reason: string;
    result: string;
    severity: string;
    target: string;
    tenantId: string;
    traceId: string;
}
interface PrismaOutboxEventCreateInput {
    aggregateId: string;
    aggregateType: string;
    id: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    queue: string;
    status: string;
    traceId: string;
    type: string;
}
interface PrismaServiceAdminAuditEventCreateInput {
    action: string;
    actor: string;
    actorName: string;
    at: Date;
    id: string;
    immutable: boolean;
    reason: string | null;
    result: string;
    severity: string;
    target: string;
    tenantId: string | null;
    traceId: string;
    userId: string | null;
}
interface PrismaServiceAdminAuditExportCreateInput {
    createdAt: Date;
    descriptor: Record<string, unknown>;
    descriptorId: string;
    expiresAt: Date;
    filters: Record<string, string>;
    id: string;
    objectKey: string;
    redactionPolicy: string;
    requesterId: string;
    requesterName: string;
    sourceEventIds: string[];
}
interface PrismaServiceAdminAuditRedactionCreateInput {
    actor: string;
    actorName: string;
    at: Date;
    createdAt: Date;
    eventId: string;
    id: string;
    overlay: Record<string, unknown>;
    reason: string;
}
interface PrismaServiceAdminImpersonationCreateInput {
    auditEventId?: string | null;
    approvalId: string | null;
    banner: string;
    durationMinutes: number;
    expiresAt: Date;
    id: string;
    mode: string;
    startedAt: Date;
    stoppedAt: Date | null;
    stopAuditEvent: Record<string, unknown> | null;
    tenantId: string;
    tenantName: string;
    userId: string | null;
    userName: string | null;
}
interface PrismaServiceAdminImpersonationUpdateInput {
    stoppedAt?: Date;
    stopAuditEvent?: Record<string, unknown>;
}
interface PrismaBreakGlassApprovalCreateInput {
    action: string;
    auditEventId: string;
    durationMinutes: number;
    expiresAt: Date;
    id: string;
    requestedAt: Date;
    status: string;
    target: string;
    tenantId: string | null;
    userId: string | null;
}
interface PrismaBreakGlassApprovalUpdateInput {
    status: string;
}
interface PrismaTenantUserUpdateInput {
    device?: string;
    email?: string;
    inviteStatus?: string;
    lastActiveAt?: Date | null;
    metadata?: Record<string, unknown>;
    mfa?: string;
    name?: string;
    risk?: string;
    role?: string;
    sessions?: number;
    status?: string;
    supportNotes?: string;
    tenantId?: string;
}
export declare const PASSWORD_CREDENTIAL_ALGORITHM: "scrypt";
export declare function hashPasswordCredential(password: string): string;
export declare function isLegacyPasswordCredential(credential: IdentityPasswordCredential | undefined): boolean;
export declare function hashServiceAdminToken(token: string): string;
export declare function hashAuthFlowToken(token: string): string;
export declare function verifyPasswordCredential(password: string, credential: IdentityPasswordCredential | undefined): boolean;
export declare function createEmptyIdentityState(): IdentityState;
