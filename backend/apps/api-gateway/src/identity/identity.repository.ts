import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { type ServiceAdminSessionRecord } from "@support-communication/auth-context";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { createOutboxEvent, type OutboxEvent } from "@support-communication/events";
import { addMinutes, makeAuditId, makeMfaChallengeId } from "./backend-ids.js";
import {
  identityPermissionRoleCatalog,
  identityServiceAdminTariffCatalog,
  serviceAdminPrivilegedActions
} from "./runtime-catalog.js";
import type {
  IdentityAvailableOrganization,
  IdentityPermissionRole,
  IdentityServiceAdminFeatureFlag,
  IdentityServiceAdminIncident,
  IdentityServiceAdminTariff,
  IdentityTenant,
  IdentityTenantAuditEvent,
  IdentityTenantUser
} from "./identity.types.js";
import { createTenantOperatorSessionTokens, resolveTenantOperatorPermissions } from "./tenant-operator-auth.js";

export type {
  IdentityPermissionRole,
  IdentityServiceAdminFeatureFlag,
  IdentityServiceAdminIncident,
  IdentityServiceAdminTariff,
  IdentityTenant,
  IdentityTenantAuditEvent,
  IdentityTenantUser
} from "./identity.types.js";

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

export class ActiveServiceAdminImpersonationError extends Error {
  constructor(
    readonly tenantId: string,
    readonly userId: string | null
  ) {
    super(`Active service-admin impersonation already exists for tenant ${tenantId} and user ${userId ?? "(tenant)"}.`);
    this.name = "ActiveServiceAdminImpersonationError";
  }
}

export function isActiveServiceAdminImpersonationConflict(error: unknown): boolean {
  return error instanceof ActiveServiceAdminImpersonationError
    || error instanceof Error && /Active service-admin impersonation already exists/.test(error.message);
}

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

export type MfaChallengeConsumeResult =
  | {
      challenge: IdentityMfaChallenge;
      valid: true;
    }
  | {
      code: "mfa_challenge_attempts_exceeded" | "mfa_challenge_consumed" | "mfa_challenge_expired" | "mfa_challenge_mismatch" | "mfa_challenge_not_found" | "mfa_challenge_required" | "mfa_otp_invalid";
      message: string;
      valid: false;
    };

export type InviteTokenConsumeResult =
  | {
      status: "consumed";
      token: IdentityAuthInviteToken;
    }
  | {
      code: "invite_email_mismatch" | "invite_expired" | "invite_not_found";
      message: string;
      status: "denied";
    };

export type RecoveryTokenConsumeResult =
  | {
      status: "consumed";
      token: IdentityAuthRecoveryToken;
    }
  | {
      code: "recovery_expired" | "recovery_not_found";
      message: string;
      status: "denied";
    };

export type PasswordRecoveryCompletionResult =
  | {
      credential: IdentityPasswordCredential;
      revokedSessions: number;
      revokedTokenPairs: number;
      status: "consumed";
    }
  | {
      code: "recovery_expired" | "recovery_not_found";
      message: string;
      status: "denied";
    };

export type OidcCallbackDescriptorConsumeResult =
  | {
      descriptor: IdentityOidcCallbackDescriptor;
      status: "consumed";
    }
  | {
      code: "oidc_callback_expired" | "oidc_callback_not_found" | "oidc_callback_replayed" | "oidc_callback_state_required";
      descriptor?: IdentityOidcCallbackDescriptor;
      message: string;
      status: "expired" | "missing" | "replayed";
    };

export type SamlAcsRequestDescriptorConsumeResult =
  | {
      descriptor: IdentitySamlAcsRequestDescriptor;
      status: "consumed";
    }
  | {
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
const supportedTenantStatuses = new Set(["active", "watch", "restricted", "trial"]);

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
  findTenantUser(userId: string | undefined): MaybePromise<IdentityTenantUser | undefined>;
  findTenantUserByEmail(email: string): MaybePromise<IdentityTenantUser | undefined>;
  findTenantUsers(tenantId: string): MaybePromise<IdentityTenantUser[]>;
  findTenantOperatorSession(sessionId: string | undefined): MaybePromise<StoredTenantOperatorSession | undefined>;
  findTenantOperatorSessionByAccessToken(accessToken: string): MaybePromise<{
    permissions: string[];
    session: StoredTenantOperatorSession;
    user: IdentityTenantUser;
  } | undefined>;
  getActiveRbacPolicyVersion(): MaybePromise<IdentityRbacPolicyVersion | undefined>;
  getPasswordPolicy(scope: string): MaybePromise<IdentityPasswordPolicy | undefined>;
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
  saveTenant(tenant: IdentityTenant): MaybePromise<IdentityTenant>;
  saveTenantUser(user: IdentityTenantUser): MaybePromise<IdentityTenantUser>;
  revokeTenantOperatorSession(input: { sessionId?: string; token?: string }): MaybePromise<boolean>;
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

interface IdentityRepositoryOptions {
  filePath: string;
  seed?: IdentityState;
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

let defaultRepository: IdentityRepository | null = null;

export class IdentityRepository implements IdentityRepositoryPort {
  private constructor(private readonly adapter: IdentityRepositoryPort) {}

  static default(): IdentityRepository {
    defaultRepository ??= IdentityRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: IdentityRepository): void {
    defaultRepository = repository;
  }

  static inMemory(seed: IdentityState = createEmptyIdentityState()): IdentityRepository {
    return new IdentityRepository(createDurableIdentityRepository(new InMemoryStore(seed)));
  }

  static open({ filePath, seed = createEmptyIdentityState() }: IdentityRepositoryOptions): IdentityRepository {
    return new IdentityRepository(createDurableIdentityRepository(new JsonFileStore({ filePath, seed })));
  }

  static prisma({ client }: PrismaIdentityRepositoryOptions): IdentityRepository {
    return new IdentityRepository(new PrismaIdentityRepository(client));
  }

  listTenants(): MaybePromise<IdentityTenant[]> {
    return this.adapter.listTenants();
  }

  findTenant(tenantId: string): MaybePromise<IdentityTenant | undefined> {
    return this.adapter.findTenant(tenantId);
  }

  saveTenant(tenant: IdentityTenant): MaybePromise<IdentityTenant> {
    return this.adapter.saveTenant(tenant);
  }

  saveTenantUser(user: IdentityTenantUser): MaybePromise<IdentityTenantUser> {
    return this.adapter.saveTenantUser(user);
  }

  findTenantAuditEvents(tenantId: string): MaybePromise<IdentityTenantAuditEvent[]> {
    return this.adapter.findTenantAuditEvents(tenantId);
  }

  findTenantUser(userId: string | undefined): MaybePromise<IdentityTenantUser | undefined> {
    return this.adapter.findTenantUser(userId);
  }

  findTenantUserByEmail(email: string): MaybePromise<IdentityTenantUser | undefined> {
    return this.adapter.findTenantUserByEmail(email);
  }

  findTenantUsers(tenantId: string): MaybePromise<IdentityTenantUser[]> {
    return this.adapter.findTenantUsers(tenantId);
  }

  listServiceAdminAuditEvents(): MaybePromise<IdentityServiceAdminAuditEvent[]> {
    return this.adapter.listServiceAdminAuditEvents();
  }

  listServiceAdminAuditExports(): MaybePromise<IdentityServiceAdminAuditExport[]> {
    return this.adapter.listServiceAdminAuditExports();
  }

  listServiceAdminAuditRedactions(): MaybePromise<IdentityServiceAdminAuditRedaction[]> {
    return this.adapter.listServiceAdminAuditRedactions();
  }

  listPermissionRoles(): MaybePromise<IdentityPermissionRole[]> {
    return this.adapter.listPermissionRoles();
  }

  listPrivilegedServiceAdminActions(): MaybePromise<string[]> {
    return this.adapter.listPrivilegedServiceAdminActions();
  }

  listServiceAdminTariffs(): MaybePromise<IdentityServiceAdminTariff[]> {
    return this.adapter.listServiceAdminTariffs();
  }

  listServiceAdminIncidents(): MaybePromise<IdentityServiceAdminIncident[]> {
    return this.adapter.listServiceAdminIncidents();
  }

  listServiceAdminFeatureFlags(): MaybePromise<IdentityServiceAdminFeatureFlag[]> {
    return this.adapter.listServiceAdminFeatureFlags();
  }

  getActiveRbacPolicyVersion(): MaybePromise<IdentityRbacPolicyVersion | undefined> {
    return this.adapter.getActiveRbacPolicyVersion();
  }

  saveRbacPolicyVersion(policyVersion: IdentityRbacPolicyVersion): MaybePromise<IdentityRbacPolicyVersion> {
    return this.adapter.saveRbacPolicyVersion(policyVersion);
  }

  recordRbacRoleGrant(grant: IdentityRbacRoleGrant): MaybePromise<IdentityRbacRoleGrant> {
    return this.adapter.recordRbacRoleGrant(grant);
  }

  listRbacRoleGrants(input: ListRbacRoleGrantsInput = {}): MaybePromise<IdentityRbacRoleGrant[]> {
    return this.adapter.listRbacRoleGrants(input);
  }

  recordPermissionDenialEvent(event: IdentityPermissionDenialEvent): MaybePromise<IdentityPermissionDenialEvent> {
    return this.adapter.recordPermissionDenialEvent(event);
  }

  listPermissionDenialEvents(input: ListPermissionDenialEventsInput = {}): MaybePromise<IdentityPermissionDenialEvent[]> {
    return this.adapter.listPermissionDenialEvents(input);
  }

  recordServiceAdminAuditEvent(event: IdentityServiceAdminAuditEvent): MaybePromise<IdentityServiceAdminAuditEvent> {
    return this.adapter.recordServiceAdminAuditEvent(event);
  }

  recordServiceAdminAuditExport(exportRecord: IdentityServiceAdminAuditExport): MaybePromise<IdentityServiceAdminAuditExport> {
    return this.adapter.recordServiceAdminAuditExport(exportRecord);
  }

  recordServiceAdminAuditRedaction(redaction: IdentityServiceAdminAuditRedaction): MaybePromise<IdentityServiceAdminAuditRedaction> {
    return this.adapter.recordServiceAdminAuditRedaction(redaction);
  }

  applyServiceAdminUserAction(input: ServiceAdminUserActionInput): MaybePromise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    user: IdentityTenantUser;
  }> {
    return this.adapter.applyServiceAdminUserAction(input);
  }

  createServiceAdminImpersonation(input: CreateServiceAdminImpersonationInput): MaybePromise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    session: IdentityServiceAdminImpersonationSession;
  }> {
    return this.adapter.createServiceAdminImpersonation(input);
  }

  findActiveServiceAdminImpersonation(input: FindActiveServiceAdminImpersonationInput): MaybePromise<IdentityServiceAdminImpersonationSession | undefined> {
    return this.adapter.findActiveServiceAdminImpersonation(input);
  }

  findServiceAdminImpersonation(impersonationId: string | undefined): MaybePromise<IdentityServiceAdminImpersonationSession | undefined> {
    return this.adapter.findServiceAdminImpersonation(impersonationId);
  }

  stopServiceAdminImpersonation(input: StopServiceAdminImpersonationInput): MaybePromise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    session: IdentityServiceAdminImpersonationSession;
  }> {
    return this.adapter.stopServiceAdminImpersonation(input);
  }

  createBreakGlassApproval(input: CreateBreakGlassApprovalInput): MaybePromise<{
    approval: IdentityBreakGlassApproval;
    auditEvent: IdentityServiceAdminAuditEvent;
  }> {
    return this.adapter.createBreakGlassApproval(input);
  }

  findBreakGlassApproval(approvalId: string | undefined): MaybePromise<IdentityBreakGlassApproval | undefined> {
    return this.adapter.findBreakGlassApproval(approvalId);
  }

  decideBreakGlassApproval(input: DecideBreakGlassApprovalInput): MaybePromise<{
    approval: IdentityBreakGlassApproval;
    auditEvent: IdentityServiceAdminAuditEvent;
  }> {
    return this.adapter.decideBreakGlassApproval(input);
  }

  updateTenantStatus(input: TenantStatusChangeInput): MaybePromise<{
    auditEvent: IdentityTenantAuditEvent;
    outbox: OutboxEvent;
    tenant: IdentityTenant;
  }> {
    return this.adapter.updateTenantStatus(input);
  }

  createMfaChallenge(input: CreateMfaChallengeInput): MaybePromise<IdentityMfaChallenge> {
    return this.adapter.createMfaChallenge(input);
  }

  createInviteToken(input: CreateInviteTokenInput): MaybePromise<IdentityAuthInviteToken> {
    return this.adapter.createInviteToken(input);
  }

  createRecoveryToken(email: string): MaybePromise<IdentityAuthRecoveryToken> {
    return this.adapter.createRecoveryToken(email);
  }

  createTenantOperatorSession(input: CreateTenantOperatorSessionInput): MaybePromise<CreateTenantOperatorSessionResult> {
    return this.adapter.createTenantOperatorSession(input);
  }

  consumeInviteToken(input: ConsumeInviteTokenInput): MaybePromise<InviteTokenConsumeResult> {
    return this.adapter.consumeInviteToken(input);
  }

  consumeMfaChallenge(input: ConsumeMfaChallengeInput): MaybePromise<MfaChallengeConsumeResult> {
    return this.adapter.consumeMfaChallenge(input);
  }

  consumeRecoveryToken(input: ConsumeRecoveryTokenInput): MaybePromise<RecoveryTokenConsumeResult> {
    return this.adapter.consumeRecoveryToken(input);
  }

  completePasswordRecovery(input: CompletePasswordRecoveryInput): MaybePromise<PasswordRecoveryCompletionResult> {
    return this.adapter.completePasswordRecovery(input);
  }

  consumeOidcCallbackDescriptor(input: ConsumeOidcCallbackDescriptorInput): MaybePromise<OidcCallbackDescriptorConsumeResult> {
    return this.adapter.consumeOidcCallbackDescriptor(input);
  }

  consumeSamlAcsRequestDescriptor(input: ConsumeSamlAcsRequestDescriptorInput): MaybePromise<SamlAcsRequestDescriptorConsumeResult> {
    return this.adapter.consumeSamlAcsRequestDescriptor(input);
  }

  findMfaChallenge(challengeId: string | undefined): MaybePromise<IdentityMfaChallenge | undefined> {
    return this.adapter.findMfaChallenge(challengeId);
  }

  findPasswordCredentialByEmail(email: string): MaybePromise<IdentityPasswordCredential | undefined> {
    return this.adapter.findPasswordCredentialByEmail(email);
  }

  savePasswordCredential(credential: IdentityPasswordCredential): MaybePromise<IdentityPasswordCredential> {
    return this.adapter.savePasswordCredential(credential);
  }

  getPasswordPolicy(scope: string): MaybePromise<IdentityPasswordPolicy | undefined> {
    return this.adapter.getPasswordPolicy(scope);
  }

  savePasswordPolicy(policy: IdentityPasswordPolicy): MaybePromise<IdentityPasswordPolicy> {
    return this.adapter.savePasswordPolicy(policy);
  }

  recordCredentialAuditEvent(event: IdentityCredentialAuditEvent): MaybePromise<IdentityCredentialAuditEvent> {
    return this.adapter.recordCredentialAuditEvent(event);
  }

  listCredentialAuditEvents(subjectId: string): MaybePromise<IdentityCredentialAuditEvent[]> {
    return this.adapter.listCredentialAuditEvents(subjectId);
  }

  saveOidcProviderConfig(config: IdentityOidcProviderConfig): MaybePromise<IdentityOidcProviderConfig> {
    return this.adapter.saveOidcProviderConfig(config);
  }

  findOidcProviderConfig(providerId: string): MaybePromise<IdentityOidcProviderConfig | undefined> {
    return this.adapter.findOidcProviderConfig(providerId);
  }

  recordOidcCallbackDescriptor(descriptor: IdentityOidcCallbackDescriptor): MaybePromise<IdentityOidcCallbackDescriptor> {
    return this.adapter.recordOidcCallbackDescriptor(descriptor);
  }

  findOidcCallbackDescriptor(state: string): MaybePromise<IdentityOidcCallbackDescriptor | undefined> {
    return this.adapter.findOidcCallbackDescriptor(state);
  }

  saveSamlProviderMetadata(metadata: IdentitySamlProviderMetadata): MaybePromise<IdentitySamlProviderMetadata> {
    return this.adapter.saveSamlProviderMetadata(metadata);
  }

  findSamlProviderMetadata(providerId: string): MaybePromise<IdentitySamlProviderMetadata | undefined> {
    return this.adapter.findSamlProviderMetadata(providerId);
  }

  recordSamlAcsRequestDescriptor(descriptor: IdentitySamlAcsRequestDescriptor): MaybePromise<IdentitySamlAcsRequestDescriptor> {
    return this.adapter.recordSamlAcsRequestDescriptor(descriptor);
  }

  findSamlAcsRequestDescriptor(requestId: string): MaybePromise<IdentitySamlAcsRequestDescriptor | undefined> {
    return this.adapter.findSamlAcsRequestDescriptor(requestId);
  }

  recordSamlAssertionReplay(replay: IdentitySamlAssertionReplay): MaybePromise<IdentitySamlAssertionReplay> {
    return this.adapter.recordSamlAssertionReplay(replay);
  }

  findSamlAssertionReplay(providerId: string, assertionId: string): MaybePromise<IdentitySamlAssertionReplay | undefined> {
    return this.adapter.findSamlAssertionReplay(providerId, assertionId);
  }

  createServiceAdminSession(input: CreateServiceAdminSessionInput = {}): MaybePromise<StoredServiceAdminSession> {
    return this.adapter.createServiceAdminSession(input);
  }

  createServiceAdminTokenPair(input: CreateServiceAdminTokenPairInput): MaybePromise<IdentityServiceAdminTokenPair> {
    return this.adapter.createServiceAdminTokenPair(input);
  }

  findServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined> {
    return this.adapter.findServiceAdminSession(sessionId);
  }

  findServiceAdminSessionByAccessToken(accessToken: string): MaybePromise<StoredServiceAdminSession | undefined> {
    return this.adapter.findServiceAdminSessionByAccessToken(accessToken);
  }

  findTenantOperatorSession(sessionId: string | undefined): MaybePromise<StoredTenantOperatorSession | undefined> {
    return this.adapter.findTenantOperatorSession(sessionId);
  }

  findTenantOperatorSessionByAccessToken(accessToken: string): MaybePromise<{
    permissions: string[];
    session: StoredTenantOperatorSession;
    user: IdentityTenantUser;
  } | undefined> {
    return this.adapter.findTenantOperatorSessionByAccessToken(accessToken);
  }

  revokeServiceAdminSession(sessionId: string | undefined): MaybePromise<StoredServiceAdminSession | undefined> {
    return this.adapter.revokeServiceAdminSession(sessionId);
  }

  revokeTenantOperatorSession(input: { sessionId?: string; token?: string }): MaybePromise<boolean> {
    return this.adapter.revokeTenantOperatorSession(input);
  }

  rotateServiceAdminRefreshToken(input: RotateServiceAdminRefreshTokenInput): MaybePromise<IdentityServiceAdminTokenRotationResult | undefined> {
    return this.adapter.rotateServiceAdminRefreshToken(input);
  }

  revokeServiceAdminToken(input: RevokeServiceAdminTokenInput): MaybePromise<IdentityServiceAdminTokenRevokeResult | undefined> {
    return this.adapter.revokeServiceAdminToken(input);
  }

  appendOutbox(event: OutboxEvent): MaybePromise<OutboxEvent> {
    return this.adapter.appendOutbox(event);
  }
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
    findUnique(input: { where: { codeHash: string } }): Promise<PrismaAuthInviteTokenRow | null>;
    updateMany(input: { data: { consumedAt: Date }; where: { consumedAt: null; id: string } }): Promise<{ count: number }>;
    upsert(input: {
      create: PrismaAuthInviteTokenCreateInput;
      update: PrismaAuthInviteTokenUpdateInput;
      where: { codeHash: string };
    }): Promise<PrismaAuthInviteTokenRow>;
  };
  authRecoveryToken: {
    findUnique(input: { where: { tokenHash: string } }): Promise<PrismaAuthRecoveryTokenRow | null>;
    updateMany(input: { data: { consumedAt: Date }; where: { consumedAt: null; id: string } }): Promise<{ count: number }>;
    upsert(input: {
      create: PrismaAuthRecoveryTokenCreateInput;
      update: PrismaAuthRecoveryTokenUpdateInput;
      where: { tokenHash: string };
    }): Promise<PrismaAuthRecoveryTokenRow>;
  };
  breakGlassApproval: {
    create(input: { data: PrismaBreakGlassApprovalCreateInput }): Promise<PrismaBreakGlassApprovalRow>;
    findUnique(input: { where: { id: string } }): Promise<PrismaBreakGlassApprovalRow | null>;
    updateMany(input: { data: PrismaBreakGlassApprovalUpdateInput; where: { id: string; status: string } }): Promise<{ count: number }>;
  };
  mfaChallenge: {
    create(input: { data: PrismaMfaChallengeCreateInput }): Promise<PrismaMfaChallengeRow>;
    findUnique(input: { where: { id: string } }): Promise<PrismaMfaChallengeRow | null>;
    updateMany(input: {
      data: { attempts?: { increment: number }; consumedAt?: Date };
      where: { attempts?: number; consumedAt: null; id: string };
    }): Promise<{ count: number }>;
  };
  outboxEvent: {
    create(input: { data: PrismaOutboxEventCreateInput }): Promise<unknown>;
  };
  oidcCallbackDescriptor: {
    create(input: { data: PrismaOidcCallbackDescriptorCreateInput }): Promise<PrismaOidcCallbackDescriptorRow>;
    findUnique(input: { where: { id: string } } | { where: { state: string } }): Promise<PrismaOidcCallbackDescriptorRow | null>;
    updateMany(input: { data: { consumedAt: Date }; where: { consumedAt: null; state: string } }): Promise<{ count: number }>;
  };
  oidcProviderConfig: {
    findUnique(input: { where: { providerId: string } }): Promise<PrismaOidcProviderConfigRow | null>;
    upsert(input: {
      create: PrismaOidcProviderConfigCreateInput;
      update: PrismaOidcProviderConfigUpdateInput;
      where: { providerId: string };
    }): Promise<PrismaOidcProviderConfigRow>;
  };
  samlAcsRequestDescriptor: {
    create(input: { data: PrismaSamlAcsRequestDescriptorCreateInput }): Promise<PrismaSamlAcsRequestDescriptorRow>;
    findUnique(input: { where: { id: string } } | { where: { relayState: string } } | { where: { requestId: string } }): Promise<PrismaSamlAcsRequestDescriptorRow | null>;
    updateMany(input: { data: { consumedAt: Date }; where: { consumedAt: null; requestId: string } }): Promise<{ count: number }>;
  };
  samlAssertionReplay: {
    create(input: { data: PrismaSamlAssertionReplayCreateInput }): Promise<PrismaSamlAssertionReplayRow>;
    findUnique(input: { where: { providerId_assertionId: { assertionId: string; providerId: string } } }): Promise<PrismaSamlAssertionReplayRow | null>;
  };
  samlProviderMetadata: {
    findUnique(input: { where: { providerId: string } }): Promise<PrismaSamlProviderMetadataRow | null>;
    upsert(input: {
      create: PrismaSamlProviderMetadataCreateInput;
      update: PrismaSamlProviderMetadataUpdateInput;
      where: { providerId: string };
    }): Promise<PrismaSamlProviderMetadataRow>;
  };
  credentialAuditEvent: {
    create(input: { data: PrismaCredentialAuditEventCreateInput }): Promise<PrismaCredentialAuditEventRow>;
    findMany(input: { orderBy: { at: "desc" }; where: { subjectId: string } }): Promise<PrismaCredentialAuditEventRow[]>;
  };
  passwordCredential: {
    findUnique(input: { where: { email: string } }): Promise<PrismaPasswordCredentialRow | null>;
    upsert(input: {
      create: PrismaPasswordCredentialCreateInput;
      update: PrismaPasswordCredentialUpdateInput;
      where: { email: string };
    }): Promise<PrismaPasswordCredentialRow>;
  };
  passwordPolicy: {
    findUnique(input: { where: { scope: string } }): Promise<PrismaPasswordPolicyRow | null>;
    upsert(input: {
      create: PrismaPasswordPolicyCreateInput;
      update: PrismaPasswordPolicyUpdateInput;
      where: { scope: string };
    }): Promise<PrismaPasswordPolicyRow>;
  };
  permissionRole: {
    findMany(input: { orderBy: { key: "asc" } }): Promise<PrismaPermissionRoleRow[]>;
  };
  rbacPolicyVersion: {
    findFirst(input: { orderBy: Array<{ activatedAt: "desc" } | { createdAt: "desc" } | { id: "desc" }>; where: { status: string } }): Promise<PrismaRbacPolicyVersionRow | null>;
    updateMany(input: {
      data: { status: "retired" };
      where: { id: { not: string }; status: "active" };
    }): Promise<{ count: number }>;
    upsert(input: {
      create: PrismaRbacPolicyVersionCreateInput;
      update: PrismaRbacPolicyVersionCreateInput;
      where: { id: string };
    }): Promise<PrismaRbacPolicyVersionRow>;
  };
  rbacRoleGrant: {
    create(input: { data: PrismaRbacRoleGrantCreateInput }): Promise<PrismaRbacRoleGrantRow>;
    findMany(input: { orderBy: { createdAt: "asc" }; where: { policyVersionId?: string; roleKey?: string; tenantId?: string | null } }): Promise<PrismaRbacRoleGrantRow[]>;
  };
  permissionDenialEvent: {
    create(input: { data: PrismaPermissionDenialEventCreateInput }): Promise<PrismaPermissionDenialEventRow>;
    findMany(input: { orderBy: { at: "desc" }; where?: { tenantId?: string } }): Promise<PrismaPermissionDenialEventRow[]>;
  };
  serviceAdminSession: {
    create(input: { data: PrismaServiceAdminSessionCreateInput }): Promise<PrismaServiceAdminSessionRow>;
    findMany(input: { where: { adminEmail: string; revokedAt?: null } }): Promise<PrismaServiceAdminSessionRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaServiceAdminSessionRow | null>;
    update(input: { data: { revokedAt: Date }; where: { id: string } }): Promise<PrismaServiceAdminSessionRow>;
    updateMany(input: { data: { revokedAt: Date }; where: { id: { in: string[] }; revokedAt: null } }): Promise<{ count: number }>;
  };
  serviceAdminTokenPair: {
    create(input: { data: PrismaServiceAdminTokenPairCreateInput }): Promise<PrismaServiceAdminTokenPairRow>;
    findFirst(input: PrismaServiceAdminTokenPairFindFirstInput): Promise<PrismaServiceAdminTokenPairRow | null>;
    update(input: { data: PrismaServiceAdminTokenPairUpdateInput; where: { id: string } }): Promise<PrismaServiceAdminTokenPairRow>;
    updateMany(input: { data: { revokedAt: Date }; where: { revokedAt: null; sessionId: { in: string[] } } }): Promise<{ count: number }>;
  };
  serviceAdminTokenRevocation: {
    create(input: { data: PrismaServiceAdminTokenRevocationCreateInput }): Promise<PrismaServiceAdminTokenRevocationRow>;
    findUnique(input: PrismaServiceAdminTokenRevocationFindUniqueInput): Promise<PrismaServiceAdminTokenRevocationRowWithPair | null>;
  };
  serviceAdminTokenRotation: {
    create(input: { data: PrismaServiceAdminTokenRotationCreateInput }): Promise<PrismaServiceAdminTokenRotationRow>;
    findUnique(input: PrismaServiceAdminTokenRotationFindUniqueInput): Promise<PrismaServiceAdminTokenRotationRowWithPairs | null>;
  };
  serviceAdminAuditEvent: {
    create(input: { data: PrismaServiceAdminAuditEventCreateInput }): Promise<PrismaServiceAdminAuditEventRow>;
    findMany(input: { orderBy: { at: "desc" } }): Promise<PrismaServiceAdminAuditEventRow[]>;
  };
  serviceAdminAuditExport: {
    create(input: { data: PrismaServiceAdminAuditExportCreateInput }): Promise<PrismaServiceAdminAuditExportRow>;
    findMany(input: { orderBy: { createdAt: "desc" } }): Promise<PrismaServiceAdminAuditExportRow[]>;
  };
  serviceAdminAuditRedaction: {
    create(input: { data: PrismaServiceAdminAuditRedactionCreateInput }): Promise<PrismaServiceAdminAuditRedactionRow>;
    findMany(input: { orderBy: { createdAt: "desc" } }): Promise<PrismaServiceAdminAuditRedactionRow[]>;
  };
  serviceAdminImpersonation: {
    create(input: { data: PrismaServiceAdminImpersonationCreateInput }): Promise<PrismaServiceAdminImpersonationRow>;
    findFirst(input: { where: { expiresAt: { gt: Date }; stoppedAt: null; tenantId: string; userId: string | null } }): Promise<PrismaServiceAdminImpersonationRow | null>;
    findUnique(input: { where: { id: string } }): Promise<PrismaServiceAdminImpersonationRow | null>;
    update(input: { data: PrismaServiceAdminImpersonationUpdateInput; where: { id: string } }): Promise<PrismaServiceAdminImpersonationRow>;
  };
  tenant: {
    create(input: { data: PrismaTenantCreateInput }): Promise<PrismaTenantRow>;
    findMany(input: { orderBy: { name: "asc" } }): Promise<PrismaTenantRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaTenantRow | null>;
    update(input: { data: PrismaTenantUpdateInput; where: { id: string } }): Promise<PrismaTenantRow>;
  };
  tenantAuditEvent: {
    create(input: { data: PrismaTenantAuditEventCreateInput }): Promise<PrismaTenantAuditEventRow>;
    findMany(input: { orderBy: { at: "desc" }; where: { tenantId: string } }): Promise<PrismaTenantAuditEventRow[]>;
  };
  tenantUser: {
    create(input: { data: PrismaTenantUserCreateInput }): Promise<PrismaTenantUserRow>;
    findFirst(input: { where: { email: string } }): Promise<PrismaTenantUserRow | null>;
    findUnique(input: { where: { id: string } }): Promise<PrismaTenantUserRow | null>;
    findMany(input: { orderBy: { name: "asc" }; where: { tenantId: string } }): Promise<PrismaTenantUserRow[]>;
    update(input: { data: PrismaTenantUserUpdateInput; where: { id: string } }): Promise<PrismaTenantUserRow>;
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

interface PrismaAuthInviteTokenCreateInput extends PrismaAuthInviteTokenRow {}

type PrismaAuthInviteTokenUpdateInput = Omit<PrismaAuthInviteTokenCreateInput, "createdAt" | "id">;

interface PrismaAuthRecoveryTokenRow {
  consumedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  tokenHash: string;
}

interface PrismaAuthRecoveryTokenCreateInput extends PrismaAuthRecoveryTokenRow {}

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
  orderBy?: { issuedAt: "asc" | "desc" };
  where: Record<string, unknown>;
}

interface PrismaServiceAdminTokenRotationFindUniqueInput {
  include: { nextTokenPair: true; previousTokenPair: true };
  where: { idempotencyKey: string };
}

interface PrismaServiceAdminTokenRevocationFindUniqueInput {
  include: { tokenPair: true };
  where: { idempotencyKey: string };
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

class PrismaIdentityRepository implements IdentityRepositoryPort {
  constructor(private readonly client: PrismaIdentityClient) {}

  async listTenants(): Promise<IdentityTenant[]> {
    const rows = await this.client.tenant.findMany({ orderBy: { name: "asc" } });
    return clone(rows.map(toIdentityTenant));
  }

  async findTenant(tenantId: string): Promise<IdentityTenant | undefined> {
    const row = await this.client.tenant.findUnique({ where: { id: tenantId } });
    return row ? clone(toIdentityTenant(row)) : undefined;
  }

  async saveTenant(tenant: IdentityTenant): Promise<IdentityTenant> {
    const data = toPrismaTenantCreateInput(tenant);
    const existing = await this.client.tenant.findUnique({ where: { id: tenant.id } });
    const row = existing
      ? await this.client.tenant.update({
        data: {
          healthScore: data.healthScore,
          metadata: data.metadata,
          name: data.name,
          status: data.status
        },
        where: { id: tenant.id }
      })
      : await this.client.tenant.create({ data });
    return clone(toIdentityTenant(row));
  }

  async saveTenantUser(user: IdentityTenantUser): Promise<IdentityTenantUser> {
    const existing = await this.client.tenantUser.findUnique({ where: { id: user.id } });
    const row = existing
      ? await this.client.tenantUser.update({
        data: toPrismaTenantUserUpdateInput(user),
        where: { id: user.id }
      })
      : await this.client.tenantUser.create({
        data: toPrismaTenantUserCreateInput(user)
      });
    return clone(toTenantUser(row));
  }

  async findTenantAuditEvents(tenantId: string): Promise<IdentityTenantAuditEvent[]> {
    const rows = await this.client.tenantAuditEvent.findMany({
      orderBy: { at: "desc" },
      where: { tenantId }
    });

    return clone(rows.map(toTenantAuditEvent));
  }

  async findTenantUsers(tenantId: string): Promise<IdentityTenantUser[]> {
    const rows = await this.client.tenantUser.findMany({
      orderBy: { name: "asc" },
      where: { tenantId }
    });

    return clone(rows.map(toTenantUser));
  }

  async findTenantUser(userId: string | undefined): Promise<IdentityTenantUser | undefined> {
    if (!userId) {
      return undefined;
    }

    const row = await this.client.tenantUser.findUnique({ where: { id: userId } });
    return row ? clone(toTenantUser(row)) : undefined;
  }

  async findTenantUserByEmail(email: string): Promise<IdentityTenantUser | undefined> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return undefined;
    }

    const row = await this.client.tenantUser.findFirst({ where: { email: normalizedEmail } });
    return row ? clone(toTenantUser(row)) : undefined;
  }

  async listServiceAdminAuditEvents(): Promise<IdentityServiceAdminAuditEvent[]> {
    const rows = await this.client.serviceAdminAuditEvent.findMany({ orderBy: { at: "desc" } });
    return clone(rows.map(toServiceAdminAuditEvent));
  }

  async recordServiceAdminAuditEvent(event: IdentityServiceAdminAuditEvent): Promise<IdentityServiceAdminAuditEvent> {
    const row = await this.client.serviceAdminAuditEvent.create({
      data: toPrismaServiceAdminAuditEventCreateInput(event)
    });
    return clone(toServiceAdminAuditEvent(row));
  }

  async listServiceAdminAuditExports(): Promise<IdentityServiceAdminAuditExport[]> {
    const rows = await this.client.serviceAdminAuditExport.findMany({ orderBy: { createdAt: "desc" } });
    return clone(rows.map(toServiceAdminAuditExport));
  }

  async recordServiceAdminAuditExport(exportRecord: IdentityServiceAdminAuditExport): Promise<IdentityServiceAdminAuditExport> {
    const row = await this.client.serviceAdminAuditExport.create({
      data: toPrismaServiceAdminAuditExportCreateInput(exportRecord)
    });
    return clone(toServiceAdminAuditExport(row));
  }

  async listServiceAdminAuditRedactions(): Promise<IdentityServiceAdminAuditRedaction[]> {
    const rows = await this.client.serviceAdminAuditRedaction.findMany({ orderBy: { createdAt: "desc" } });
    return clone(rows.map(toServiceAdminAuditRedaction));
  }

  async recordServiceAdminAuditRedaction(redaction: IdentityServiceAdminAuditRedaction): Promise<IdentityServiceAdminAuditRedaction> {
    const row = await this.client.serviceAdminAuditRedaction.create({
      data: toPrismaServiceAdminAuditRedactionCreateInput(redaction)
    });
    return clone(toServiceAdminAuditRedaction(row));
  }

  async listPermissionRoles(): Promise<IdentityPermissionRole[]> {
    const rows = await this.client.permissionRole.findMany({ orderBy: { key: "asc" } });
    const persistedRoles = rows.map(toPermissionRole);
    return clone(persistedRoles.length ? persistedRoles : identityPermissionRoleCatalog);
  }

  async listPrivilegedServiceAdminActions(): Promise<string[]> {
    return [...serviceAdminPrivilegedActions];
  }

  async listServiceAdminTariffs(): Promise<IdentityServiceAdminTariff[]> {
    return clone(identityServiceAdminTariffCatalog);
  }

  async listServiceAdminIncidents(): Promise<IdentityServiceAdminIncident[]> {
    return [];
  }

  async listServiceAdminFeatureFlags(): Promise<IdentityServiceAdminFeatureFlag[]> {
    return [];
  }

  async getActiveRbacPolicyVersion(): Promise<IdentityRbacPolicyVersion | undefined> {
    const row = await this.client.rbacPolicyVersion.findFirst({
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      where: { status: "active" }
    });
    return row ? clone(toRbacPolicyVersion(row)) : undefined;
  }

  async saveRbacPolicyVersion(policyVersion: IdentityRbacPolicyVersion): Promise<IdentityRbacPolicyVersion> {
    const input = toPrismaRbacPolicyVersionCreateInput(policyVersion);
    if (policyVersion.status === "active") {
      await this.client.rbacPolicyVersion.updateMany({
        data: { status: "retired" },
        where: { id: { not: policyVersion.id }, status: "active" }
      });
    }
    const row = await this.client.rbacPolicyVersion.upsert({
      create: input,
      update: input,
      where: { id: policyVersion.id }
    });
    return clone(toRbacPolicyVersion(row));
  }

  async recordRbacRoleGrant(grant: IdentityRbacRoleGrant): Promise<IdentityRbacRoleGrant> {
    const row = await this.client.rbacRoleGrant.create({
      data: toPrismaRbacRoleGrantCreateInput(grant)
    });
    const persistedGrant = toRbacRoleGrant(row);
    if (!persistedGrant) {
      throw new Error(`RBAC role grant ${grant.id} has unsupported effect ${row.effect}.`);
    }
    return clone(persistedGrant);
  }

  async listRbacRoleGrants(input: ListRbacRoleGrantsInput = {}): Promise<IdentityRbacRoleGrant[]> {
    const where: { policyVersionId?: string; roleKey?: string; tenantId?: string | null } = {};
    if (input.policyVersionId !== undefined) where.policyVersionId = input.policyVersionId;
    if (input.roleKey !== undefined) where.roleKey = input.roleKey;
    if (input.tenantId !== undefined) where.tenantId = input.tenantId;
    const rows = await this.client.rbacRoleGrant.findMany({
      orderBy: { createdAt: "asc" },
      where
    });
    return clone(rows.map(toRbacRoleGrant).filter((grant): grant is IdentityRbacRoleGrant => Boolean(grant)));
  }

  async recordPermissionDenialEvent(event: IdentityPermissionDenialEvent): Promise<IdentityPermissionDenialEvent> {
    const row = await this.client.permissionDenialEvent.create({
      data: toPrismaPermissionDenialEventCreateInput(event)
    });
    return clone(toPermissionDenialEvent(row));
  }

  async listPermissionDenialEvents(input: ListPermissionDenialEventsInput = {}): Promise<IdentityPermissionDenialEvent[]> {
    const rows = await this.client.permissionDenialEvent.findMany({
      orderBy: { at: "desc" },
      where: input.tenantId === undefined ? undefined : { tenantId: input.tenantId }
    });
    return clone(rows.map(toPermissionDenialEvent));
  }

  async applyServiceAdminUserAction({ auditEvent, changes, userId }: ServiceAdminUserActionInput): Promise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    user: IdentityTenantUser;
  }> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.tenantUser.findUnique({ where: { id: userId } });
      if (!existing) {
        throw new Error(`User ${userId} was not found.`);
      }

      const updated = await transaction.tenantUser.update({
        data: toPrismaTenantUserUpdateInput(changes),
        where: { id: userId }
      });
      const persistedAuditEvent = await transaction.serviceAdminAuditEvent.create({
        data: toPrismaServiceAdminAuditEventCreateInput(auditEvent)
      });

      return clone({
        auditEvent: toServiceAdminAuditEvent(persistedAuditEvent),
        user: toTenantUser(updated)
      });
    });
  }

  async createServiceAdminImpersonation({ auditEvent, session }: CreateServiceAdminImpersonationInput): Promise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    session: IdentityServiceAdminImpersonationSession;
  }> {
    return this.client.$transaction(async (transaction) => {
      await lockServiceAdminImpersonationScope(transaction, session.tenantId, session.userId);
      const active = await transaction.serviceAdminImpersonation.findFirst({
        where: {
          expiresAt: { gt: new Date(session.startedAt) },
          stoppedAt: null,
          tenantId: session.tenantId,
          userId: session.userId
        }
      });
      if (active) {
        throw new ActiveServiceAdminImpersonationError(session.tenantId, session.userId);
      }

      const persistedAuditEvent = await transaction.serviceAdminAuditEvent.create({
        data: toPrismaServiceAdminAuditEventCreateInput(auditEvent)
      });
      const persistedSession = await transaction.serviceAdminImpersonation.create({
        data: toPrismaServiceAdminImpersonationCreateInput(session)
      });

      return clone({
        auditEvent: toServiceAdminAuditEvent(persistedAuditEvent),
        session: toServiceAdminImpersonation(persistedSession)
      });
    });
  }

  async findActiveServiceAdminImpersonation({
    now = new Date(),
    tenantId,
    userId
  }: FindActiveServiceAdminImpersonationInput): Promise<IdentityServiceAdminImpersonationSession | undefined> {
    const row = await this.client.serviceAdminImpersonation.findFirst({
      where: {
        expiresAt: { gt: now },
        stoppedAt: null,
        tenantId,
        userId
      }
    });

    return row ? clone(toServiceAdminImpersonation(row)) : undefined;
  }

  async findServiceAdminImpersonation(impersonationId: string | undefined): Promise<IdentityServiceAdminImpersonationSession | undefined> {
    if (!impersonationId) {
      return undefined;
    }

    const row = await this.client.serviceAdminImpersonation.findUnique({ where: { id: impersonationId } });
    return row ? clone(toServiceAdminImpersonation(row)) : undefined;
  }

  async stopServiceAdminImpersonation({ auditEvent, impersonationId, stoppedAt }: StopServiceAdminImpersonationInput): Promise<{
    auditEvent: IdentityServiceAdminAuditEvent;
    session: IdentityServiceAdminImpersonationSession;
  }> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.serviceAdminImpersonation.findUnique({ where: { id: impersonationId } });
      if (!existing) {
        throw new Error(`Impersonation ${impersonationId} was not found.`);
      }

      const persistedAuditEvent = await transaction.serviceAdminAuditEvent.create({
        data: toPrismaServiceAdminAuditEventCreateInput(auditEvent)
      });
      const persistedSession = await transaction.serviceAdminImpersonation.update({
        data: {
          stoppedAt: new Date(stoppedAt),
          stopAuditEvent: serviceAdminAuditEventToJson(auditEvent)
        },
        where: { id: impersonationId }
      });

      return clone({
        auditEvent: toServiceAdminAuditEvent(persistedAuditEvent),
        session: toServiceAdminImpersonation(persistedSession)
      });
    });
  }

  async createBreakGlassApproval({ approval, auditEvent }: CreateBreakGlassApprovalInput): Promise<{
    approval: IdentityBreakGlassApproval;
    auditEvent: IdentityServiceAdminAuditEvent;
  }> {
    return this.client.$transaction(async (transaction) => {
      const persistedAuditEvent = await transaction.serviceAdminAuditEvent.create({
        data: toPrismaServiceAdminAuditEventCreateInput(auditEvent)
      });
      const persistedApproval = await transaction.breakGlassApproval.create({
        data: toPrismaBreakGlassApprovalCreateInput(approval)
      });

      return clone({
        approval: toBreakGlassApproval(persistedApproval),
        auditEvent: toServiceAdminAuditEvent(persistedAuditEvent)
      });
    });
  }

  async findBreakGlassApproval(approvalId: string | undefined): Promise<IdentityBreakGlassApproval | undefined> {
    if (!approvalId) {
      return undefined;
    }

    const row = await this.client.breakGlassApproval.findUnique({ where: { id: approvalId } });
    return row ? clone(toBreakGlassApproval(row)) : undefined;
  }

  async decideBreakGlassApproval({ approvalId, auditEvent, status }: DecideBreakGlassApprovalInput): Promise<{
    approval: IdentityBreakGlassApproval;
    auditEvent: IdentityServiceAdminAuditEvent;
  }> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.breakGlassApproval.findUnique({ where: { id: approvalId } });
      if (!existing) {
        throw new Error(`Break-glass approval ${approvalId} was not found.`);
      }

      const persistedAuditEvent = await transaction.serviceAdminAuditEvent.create({
        data: toPrismaServiceAdminAuditEventCreateInput(auditEvent)
      });
      const updateResult = await transaction.breakGlassApproval.updateMany({
        data: { status },
        where: { id: approvalId, status: "pending" }
      });
      if (updateResult.count !== 1) {
        throw new Error(`Break-glass approval ${approvalId} was not pending.`);
      }

      const persistedApproval = await transaction.breakGlassApproval.findUnique({ where: { id: approvalId } });
      if (!persistedApproval) {
        throw new Error(`Break-glass approval ${approvalId} was not found after decision.`);
      }

      return clone({
        approval: toBreakGlassApproval(persistedApproval),
        auditEvent: toServiceAdminAuditEvent(persistedAuditEvent)
      });
    });
  }

  async updateTenantStatus({ reason, status, tenantId, traceId }: TenantStatusChangeInput): Promise<{
    auditEvent: IdentityTenantAuditEvent;
    outbox: OutboxEvent;
    tenant: IdentityTenant;
  }> {
    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!existing) {
        throw new Error(`Tenant ${tenantId} was not found.`);
      }

      const existingMetadata = toJsonRecord(existing.metadata);
      const updated = await transaction.tenant.update({
        data: {
          metadata: { ...existingMetadata, status },
          status
        },
        where: { id: tenantId }
      });
      const auditEvent: IdentityTenantAuditEvent = {
        id: makeAuditId("tenant_status"),
        action: "tenant.status.change",
        actor: "Service Admin",
        at: new Date().toISOString(),
        immutable: true,
        reason,
        result: "ok",
        severity: status === "restricted" ? "warn" : "info",
        target: tenantId,
        tenantId,
        traceId
      };
      const outbox = createOutboxEvent({
        aggregateId: tenantId,
        aggregateType: "tenant",
        payload: { from: existing.status, reason, status },
        queue: "identity-events",
        traceId,
        type: "tenant.status.changed"
      });

      await transaction.tenantAuditEvent.create({ data: toPrismaTenantAuditEventCreateInput(auditEvent) });
      await transaction.outboxEvent.create({ data: toPrismaOutboxEventCreateInput(outbox) });

      return clone({
        auditEvent,
        outbox,
        tenant: toIdentityTenant(updated)
      });
    });
  }

  async createMfaChallenge(input: CreateMfaChallengeInput): Promise<IdentityMfaChallenge> {
    const now = new Date();
    const challenge = await this.client.mfaChallenge.create({
      data: {
        attempts: 0,
        consumedAt: null,
        createdAt: now,
        email: normalizeEmail(input.email),
        expiresAt: addMinutes(now, 10),
        id: makeMfaChallengeId(),
        maxAttempts: input.maxAttempts ?? 5,
        otpHash: input.otpHash
      }
    });

    return clone(toMfaChallenge(challenge));
  }

  async createInviteToken(input: CreateInviteTokenInput): Promise<IdentityAuthInviteToken> {
    const now = new Date();
    const code = String(input.code ?? `invite_${randomUUID()}`).trim();
    const token: IdentityAuthInviteToken = {
      code,
      consumedAt: null,
      createdAt: now.toISOString(),
      email: normalizeEmail(input.email),
      expiresAt: input.expiresAt ?? addMinutes(now, 60 * 24 * 7).toISOString(),
      id: `inv_${randomUUID()}`,
      tenantId: input.tenantId
    };
    const inputRow = toPrismaAuthInviteTokenInput({
      codeHash: hashAuthFlowToken(code),
      consumedAt: token.consumedAt,
      createdAt: token.createdAt,
      email: token.email,
      expiresAt: token.expiresAt,
      id: token.id,
      tenantId: token.tenantId
    });
    const row = await this.client.authInviteToken.upsert({
      create: inputRow,
      update: {
        codeHash: inputRow.codeHash,
        consumedAt: inputRow.consumedAt,
        email: inputRow.email,
        expiresAt: inputRow.expiresAt,
        tenantId: inputRow.tenantId
      },
      where: { codeHash: inputRow.codeHash }
    });

    return clone(toInviteTokenDescriptor(row, code));
  }

  async createRecoveryToken(email: string): Promise<IdentityAuthRecoveryToken> {
    const now = new Date();
    const tokenValue = `recovery_${randomUUID()}`;
    const token: IdentityAuthRecoveryToken = {
      consumedAt: null,
      createdAt: now.toISOString(),
      email: normalizeEmail(email),
      expiresAt: addMinutes(now, 30).toISOString(),
      id: `rcv_${randomUUID()}`,
      token: tokenValue
    };
    const inputRow = toPrismaAuthRecoveryTokenInput({
      consumedAt: token.consumedAt,
      createdAt: token.createdAt,
      email: token.email,
      expiresAt: token.expiresAt,
      id: token.id,
      tokenHash: hashAuthFlowToken(tokenValue)
    });
    const row = await this.client.authRecoveryToken.upsert({
      create: inputRow,
      update: {
        consumedAt: inputRow.consumedAt,
        email: inputRow.email,
        expiresAt: inputRow.expiresAt,
        tokenHash: inputRow.tokenHash
      },
      where: { tokenHash: inputRow.tokenHash }
    });

    return clone(toRecoveryTokenDescriptor(row, tokenValue));
  }

  async consumeMfaChallenge({ challengeId, email, now = new Date(), otpHash }: ConsumeMfaChallengeInput): Promise<MfaChallengeConsumeResult> {
    if (!challengeId) {
      return {
        code: "mfa_challenge_required",
        message: "MFA challenge id is required to complete login.",
        valid: false
      };
    }

    for (let retry = 0; retry < 3; retry += 1) {
      const challenge = await this.client.mfaChallenge.findUnique({ where: { id: challengeId } });
      const denial = resolveMfaChallengeDenial(challenge, email, now);
      if (denial) {
        return denial;
      }
      if (!challenge) {
        throw new Error("MFA challenge denial resolver returned no result for a missing challenge.");
      }

      if (!secureStringEqual(challenge.otpHash, otpHash)) {
        const persisted = await this.client.mfaChallenge.updateMany({
          data: { attempts: { increment: 1 } },
          where: { attempts: challenge.attempts, consumedAt: null, id: challengeId }
        });
        if (persisted.count === 0) {
          continue;
        }
        return {
          code: "mfa_otp_invalid",
          message: "MFA one-time code is invalid.",
          valid: false
        };
      }

      const persisted = await this.client.mfaChallenge.updateMany({
        data: { consumedAt: now },
        where: { attempts: challenge.attempts, consumedAt: null, id: challengeId }
      });
      if (persisted.count === 0) {
        continue;
      }

      return clone({
        challenge: toMfaChallenge({ ...challenge, consumedAt: now }),
        valid: true
      });
    }

    return {
      code: "mfa_challenge_consumed",
      message: "MFA challenge changed during verification. Start a new login challenge.",
      valid: false
    };
  }

  async consumeInviteToken({ code, email, now = new Date() }: ConsumeInviteTokenInput): Promise<InviteTokenConsumeResult> {
    const normalizedCode = String(code ?? "").trim();
    const token = await this.client.authInviteToken.findUnique({ where: { codeHash: hashAuthFlowToken(normalizedCode) } });
    if (!token) {
      return { code: "invite_not_found", message: "Invite token was not found.", status: "denied" };
    }

    if (token.consumedAt) {
      return { code: "invite_expired", message: "Invite token was already consumed.", status: "denied" };
    }

    if (!Number.isFinite(Date.parse(toIso(token.expiresAt))) || Date.parse(toIso(token.expiresAt)) <= now.getTime()) {
      return { code: "invite_expired", message: "Invite token has expired.", status: "denied" };
    }

    if (normalizeEmail(email) !== token.email) {
      return { code: "invite_email_mismatch", message: "Invite email does not match the token.", status: "denied" };
    }

    const persisted = await this.client.authInviteToken.updateMany({
      data: { consumedAt: now },
      where: { consumedAt: null, id: token.id }
    });
    if (persisted.count === 0) {
      return { code: "invite_expired", message: "Invite token was already consumed.", status: "denied" };
    }

    return clone({
      status: "consumed",
      token: toInviteTokenDescriptor({ ...token, consumedAt: now }, normalizedCode)
    });
  }

  async consumeRecoveryToken({ email, now = new Date(), token }: ConsumeRecoveryTokenInput): Promise<RecoveryTokenConsumeResult> {
    const normalizedToken = String(token ?? "").trim();
    const record = await this.client.authRecoveryToken.findUnique({ where: { tokenHash: hashAuthFlowToken(normalizedToken) } });
    if (!record) {
      return { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" };
    }

    if (record.consumedAt || !Number.isFinite(Date.parse(toIso(record.expiresAt))) || Date.parse(toIso(record.expiresAt)) <= now.getTime()) {
      return { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" };
    }

    if (normalizeEmail(email) !== record.email) {
      return { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" };
    }

    const persisted = await this.client.authRecoveryToken.updateMany({
      data: { consumedAt: now },
      where: { consumedAt: null, id: record.id }
    });
    if (persisted.count === 0) {
      return { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" };
    }

    return clone({
      status: "consumed",
      token: toRecoveryTokenDescriptor({ ...record, consumedAt: now }, normalizedToken)
    });
  }

  async completePasswordRecovery({ credential, email, now = new Date(), token }: CompletePasswordRecoveryInput): Promise<PasswordRecoveryCompletionResult> {
    const normalizedEmail = normalizeEmail(email);
    if (normalizeEmail(credential.email) !== normalizedEmail) {
      throw new Error("password_recovery_credential_email_mismatch");
    }

    const normalizedToken = String(token ?? "").trim();
    return this.client.$transaction(async (transaction) => {
      const record = await transaction.authRecoveryToken.findUnique({
        where: { tokenHash: hashAuthFlowToken(normalizedToken) }
      });
      if (!record || normalizeEmail(record.email) !== normalizedEmail) {
        return { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" as const };
      }
      if (record.consumedAt || !Number.isFinite(Date.parse(toIso(record.expiresAt))) || Date.parse(toIso(record.expiresAt)) <= now.getTime()) {
        return { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" as const };
      }

      const consumed = await transaction.authRecoveryToken.updateMany({
        data: { consumedAt: now },
        where: { consumedAt: null, id: record.id }
      });
      if (consumed.count === 0) {
        return { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" as const };
      }

      const credentialInput = toPrismaPasswordCredentialInput({
        ...credential,
        email: normalizedEmail
      });
      const credentialRow = await transaction.passwordCredential.upsert({
        create: credentialInput,
        update: credentialInput,
        where: { email: normalizedEmail }
      });
      const persistedCredential = toPasswordCredential(credentialRow);
      if (!persistedCredential) {
        throw new Error(`Password credential ${normalizedEmail} was persisted with an unsupported algorithm.`);
      }

      const activeSessions = await transaction.serviceAdminSession.findMany({
        where: { adminEmail: normalizedEmail, revokedAt: null }
      });
      const sessionIds = activeSessions.map((session) => session.id);
      const revokedTokenPairs = sessionIds.length
        ? await transaction.serviceAdminTokenPair.updateMany({
            data: { revokedAt: now },
            where: { revokedAt: null, sessionId: { in: sessionIds } }
          })
        : { count: 0 };
      const revokedSessions = sessionIds.length
        ? await transaction.serviceAdminSession.updateMany({
            data: { revokedAt: now },
            where: { id: { in: sessionIds }, revokedAt: null }
          })
        : { count: 0 };

      return clone({
        credential: persistedCredential,
        revokedSessions: revokedSessions.count,
        revokedTokenPairs: revokedTokenPairs.count,
        status: "consumed" as const
      });
    });
  }

  async findMfaChallenge(challengeId: string | undefined): Promise<IdentityMfaChallenge | undefined> {
    if (!challengeId) {
      return undefined;
    }

    const challenge = await this.client.mfaChallenge.findUnique({ where: { id: challengeId } });
    return challenge ? clone(toMfaChallenge(challenge)) : undefined;
  }

  async findPasswordCredentialByEmail(email: string): Promise<IdentityPasswordCredential | undefined> {
    const row = await this.client.passwordCredential.findUnique({ where: { email: normalizeEmail(email) } });
    const credential = row ? toPasswordCredential(row) : undefined;
    return credential ? clone(credential) : undefined;
  }

  async savePasswordCredential(credential: IdentityPasswordCredential): Promise<IdentityPasswordCredential> {
    const input = toPrismaPasswordCredentialInput({
      ...credential,
      email: normalizeEmail(credential.email)
    });
    const row = await this.client.passwordCredential.upsert({
      create: input,
      update: input,
      where: { email: input.email }
    });
    const persisted = toPasswordCredential(row);
    if (!persisted) {
      throw new Error(`Password credential ${input.email} was persisted with an unsupported algorithm.`);
    }
    return clone(persisted);
  }

  async getPasswordPolicy(scope: string): Promise<IdentityPasswordPolicy | undefined> {
    const row = await this.client.passwordPolicy.findUnique({ where: { scope } });
    return row ? clone(toPasswordPolicy(row)) : undefined;
  }

  async savePasswordPolicy(policy: IdentityPasswordPolicy): Promise<IdentityPasswordPolicy> {
    const input = toPrismaPasswordPolicyInput(policy);
    const row = await this.client.passwordPolicy.upsert({
      create: input,
      update: input,
      where: { scope: input.scope }
    });
    return clone(toPasswordPolicy(row));
  }

  async recordCredentialAuditEvent(event: IdentityCredentialAuditEvent): Promise<IdentityCredentialAuditEvent> {
    const row = await this.client.credentialAuditEvent.create({
      data: toPrismaCredentialAuditEventCreateInput(event)
    });
    return clone(toCredentialAuditEvent(row));
  }

  async listCredentialAuditEvents(subjectId: string): Promise<IdentityCredentialAuditEvent[]> {
    const rows = await this.client.credentialAuditEvent.findMany({
      orderBy: { at: "desc" },
      where: { subjectId }
    });
    return clone(rows.map(toCredentialAuditEvent));
  }

  async saveOidcProviderConfig(config: IdentityOidcProviderConfig): Promise<IdentityOidcProviderConfig> {
    const input = toPrismaOidcProviderConfigInput(config);
    const row = await this.client.oidcProviderConfig.upsert({
      create: input,
      update: input,
      where: { providerId: input.providerId }
    });
    return clone(toOidcProviderConfig(row));
  }

  async findOidcProviderConfig(providerId: string): Promise<IdentityOidcProviderConfig | undefined> {
    const row = await this.client.oidcProviderConfig.findUnique({ where: { providerId } });
    return row ? clone(toOidcProviderConfig(row)) : undefined;
  }

  async recordOidcCallbackDescriptor(descriptor: IdentityOidcCallbackDescriptor): Promise<IdentityOidcCallbackDescriptor> {
    const duplicateById = await this.client.oidcCallbackDescriptor.findUnique({ where: { id: descriptor.id } });
    const duplicateByState = await this.client.oidcCallbackDescriptor.findUnique({ where: { state: descriptor.state } });
    if (duplicateById || duplicateByState) {
      throw new Error("OIDC callback descriptor already exists.");
    }

    const row = await this.client.oidcCallbackDescriptor.create({
      data: toPrismaOidcCallbackDescriptorCreateInput(descriptor)
    });
    return clone(toOidcCallbackDescriptor(row));
  }

  async findOidcCallbackDescriptor(state: string): Promise<IdentityOidcCallbackDescriptor | undefined> {
    const row = await this.client.oidcCallbackDescriptor.findUnique({ where: { state } });
    return row ? clone(toOidcCallbackDescriptor(row)) : undefined;
  }

  async consumeOidcCallbackDescriptor({ now = new Date(), state }: ConsumeOidcCallbackDescriptorInput): Promise<OidcCallbackDescriptorConsumeResult> {
    if (!state) {
      return {
        code: "oidc_callback_state_required",
        message: "OIDC callback state is required.",
        status: "missing"
      };
    }

    const row = await this.client.oidcCallbackDescriptor.findUnique({ where: { state } });
    if (!row) {
      return {
        code: "oidc_callback_not_found",
        message: "OIDC callback descriptor was not found.",
        status: "missing"
      };
    }

    const descriptor = toOidcCallbackDescriptor(row);
    if (descriptor.consumedAt) {
      return {
        code: "oidc_callback_replayed",
        descriptor,
        message: "OIDC callback descriptor was already consumed.",
        status: "replayed"
      };
    }

    if (!Number.isFinite(Date.parse(descriptor.expiresAt)) || Date.parse(descriptor.expiresAt) <= now.getTime()) {
      return {
        code: "oidc_callback_expired",
        descriptor,
        message: "OIDC callback descriptor has expired.",
        status: "expired"
      };
    }

    const persisted = await this.client.oidcCallbackDescriptor.updateMany({
      data: { consumedAt: now },
      where: { consumedAt: null, state }
    });
    if (persisted.count === 0) {
      return {
        code: "oidc_callback_replayed",
        descriptor,
        message: "OIDC callback descriptor was already consumed.",
        status: "replayed"
      };
    }

    return clone({
      descriptor: { ...descriptor, consumedAt: now.toISOString() },
      status: "consumed" as const
    });
  }

  async saveSamlProviderMetadata(metadata: IdentitySamlProviderMetadata): Promise<IdentitySamlProviderMetadata> {
    const input = toPrismaSamlProviderMetadataInput(metadata);
    const row = await this.client.samlProviderMetadata.upsert({
      create: input,
      update: input,
      where: { providerId: input.providerId }
    });
    return clone(toSamlProviderMetadata(row));
  }

  async findSamlProviderMetadata(providerId: string): Promise<IdentitySamlProviderMetadata | undefined> {
    const row = await this.client.samlProviderMetadata.findUnique({ where: { providerId } });
    return row ? clone(toSamlProviderMetadata(row)) : undefined;
  }

  async recordSamlAcsRequestDescriptor(descriptor: IdentitySamlAcsRequestDescriptor): Promise<IdentitySamlAcsRequestDescriptor> {
    const duplicateById = await this.client.samlAcsRequestDescriptor.findUnique({ where: { id: descriptor.id } });
    const duplicateByRequestId = await this.client.samlAcsRequestDescriptor.findUnique({ where: { requestId: descriptor.requestId } });
    const duplicateByRelayState = await this.client.samlAcsRequestDescriptor.findUnique({ where: { relayState: descriptor.relayState } });
    if (duplicateById || duplicateByRequestId || duplicateByRelayState) {
      throw new Error("SAML ACS request descriptor already exists.");
    }

    const row = await this.client.samlAcsRequestDescriptor.create({
      data: toPrismaSamlAcsRequestDescriptorCreateInput(descriptor)
    });
    return clone(toSamlAcsRequestDescriptor(row));
  }

  async findSamlAcsRequestDescriptor(requestId: string): Promise<IdentitySamlAcsRequestDescriptor | undefined> {
    const row = await this.client.samlAcsRequestDescriptor.findUnique({ where: { requestId } });
    return row ? clone(toSamlAcsRequestDescriptor(row)) : undefined;
  }

  async consumeSamlAcsRequestDescriptor({ now = new Date(), requestId }: ConsumeSamlAcsRequestDescriptorInput): Promise<SamlAcsRequestDescriptorConsumeResult> {
    if (!requestId) {
      return {
        code: "saml_acs_request_required",
        message: "SAML ACS request id is required.",
        status: "missing"
      };
    }

    const row = await this.client.samlAcsRequestDescriptor.findUnique({ where: { requestId } });
    if (!row) {
      return {
        code: "saml_acs_request_not_found",
        message: "SAML ACS request descriptor was not found.",
        status: "missing"
      };
    }

    const descriptor = toSamlAcsRequestDescriptor(row);
    if (descriptor.consumedAt) {
      return {
        code: "saml_acs_request_replayed",
        descriptor,
        message: "SAML ACS request descriptor was already consumed.",
        status: "replayed"
      };
    }

    if (!Number.isFinite(Date.parse(descriptor.expiresAt)) || Date.parse(descriptor.expiresAt) <= now.getTime()) {
      return {
        code: "saml_acs_request_expired",
        descriptor,
        message: "SAML ACS request descriptor has expired.",
        status: "expired"
      };
    }

    const persisted = await this.client.samlAcsRequestDescriptor.updateMany({
      data: { consumedAt: now },
      where: { consumedAt: null, requestId }
    });
    if (persisted.count === 0) {
      return {
        code: "saml_acs_request_replayed",
        descriptor,
        message: "SAML ACS request descriptor was already consumed.",
        status: "replayed"
      };
    }

    return clone({
      descriptor: { ...descriptor, consumedAt: now.toISOString() },
      status: "consumed" as const
    });
  }

  async recordSamlAssertionReplay(replay: IdentitySamlAssertionReplay): Promise<IdentitySamlAssertionReplay> {
    const duplicate = await this.client.samlAssertionReplay.findUnique({
      where: { providerId_assertionId: { assertionId: replay.assertionId, providerId: replay.providerId } }
    });
    if (duplicate) {
      throw new Error("SAML assertion replay already exists.");
    }

    const row = await this.client.samlAssertionReplay.create({
      data: toPrismaSamlAssertionReplayCreateInput(replay)
    });
    return clone(toSamlAssertionReplay(row));
  }

  async findSamlAssertionReplay(providerId: string, assertionId: string): Promise<IdentitySamlAssertionReplay | undefined> {
    const row = await this.client.samlAssertionReplay.findUnique({
      where: { providerId_assertionId: { assertionId, providerId } }
    });
    return row ? clone(toSamlAssertionReplay(row)) : undefined;
  }

  async createServiceAdminSession(input: CreateServiceAdminSessionInput = {}): Promise<StoredServiceAdminSession> {
    const resolved = resolveServiceAdminSessionInput(input);
    const now = new Date();
    const row = await this.client.serviceAdminSession.create({
      data: {
        actorId: resolved.actorId,
        actorName: resolved.actorName,
        adminEmail: resolved.adminEmail,
        adminId: resolved.actorId,
        adminName: resolved.actorName,
        allowedActions: resolved.allowedActions,
        authState: "mfa_verified",
        availableOrganizations: resolved.availableOrganizations,
        currentTenantId: resolved.currentTenantId,
        expiresAt: addMinutes(now, input.ttlMinutes ?? 240),
        id: `${input.sessionIdPrefix ?? "svc-session"}_${randomUUID()}`,
        mfaVerifiedAt: input.mfaVerified === false ? null : now,
        revokedAt: null,
        role: resolved.role,
        tenantScope: resolved.tenantScope
      }
    });

    return clone(toServiceAdminSession(row));
  }

  async createTenantOperatorSession(input: CreateTenantOperatorSessionInput): Promise<CreateTenantOperatorSessionResult> {
    const user = await this.findTenantUser(input.userId);
    if (!user || user.status !== "active" || user.tenantId !== input.tenantId) {
      throw new Error(`Tenant operator ${input.userId} is unavailable for tenant ${input.tenantId}.`);
    }

    const permissionRoles = await this.listPermissionRoles();
    const permissions = resolveTenantOperatorPermissions(user.role, permissionRoles);
    const session = await this.createServiceAdminSession({
      actorId: user.id,
      actorName: user.name,
      adminEmail: user.email,
      allowedActions: permissions,
      availableOrganizations: [{ id: user.tenantId, name: user.tenantId, role: "operator" }],
      currentTenantId: user.tenantId,
      role: user.role,
      sessionIdPrefix: "top-session",
      tenantScope: user.tenantId,
      ttlMinutes: 60
    });
    const tokenPair = createTenantOperatorSessionTokens({
      hashToken: hashServiceAdminToken,
      sessionId: session.id,
      subjectId: user.id
    });
    await this.createServiceAdminTokenPair({
      accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
      accessTokenHash: tokenPair.accessTokenHash,
      id: tokenPair.id,
      issuedAt: tokenPair.issuedAt,
      refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
      refreshTokenHash: tokenPair.refreshTokenHash,
      sessionId: tokenPair.sessionId,
      subjectId: tokenPair.subjectId
    });

    return {
      accessToken: tokenPair.accessToken,
      expiresAt: tokenPair.accessTokenExpiresAt,
      refreshToken: tokenPair.refreshToken,
      sessionId: session.id
    };
  }

  async createServiceAdminTokenPair(input: CreateServiceAdminTokenPairInput): Promise<IdentityServiceAdminTokenPair> {
    if (input.accessTokenHash === input.refreshTokenHash) {
      throw new Error("Service-admin token hash conflict.");
    }

    const existingPair = await this.client.serviceAdminTokenPair.findFirst({ where: { id: input.id } });
    if (existingPair) {
      if (serviceAdminTokenPairMatchesInput(existingPair, input)) {
        return clone(toServiceAdminTokenPair(existingPair));
      }

      throw new Error("Service-admin token pair id conflict.");
    }

    const conflict = await this.client.serviceAdminTokenPair.findFirst({
      where: toPrismaActiveTokenHashConflictWhere({
        accessTokenHash: input.accessTokenHash,
        refreshTokenHash: input.refreshTokenHash
      }, input.id)
    });
    if (conflict) {
      throw new Error("Service-admin token hash conflict.");
    }

    const row = await this.client.serviceAdminTokenPair.create({
      data: toPrismaServiceAdminTokenPairCreateInput(input)
    });
    return clone(toServiceAdminTokenPair(row));
  }

  async findServiceAdminSession(sessionId: string | undefined): Promise<StoredServiceAdminSession | undefined> {
    if (!sessionId) {
      return undefined;
    }

    const session = await this.client.serviceAdminSession.findUnique({ where: { id: sessionId } });
    return session ? clone(toServiceAdminSession(session)) : undefined;
  }

  async findServiceAdminSessionByAccessToken(accessToken: string): Promise<StoredServiceAdminSession | undefined> {
    const tokenPair = await this.client.serviceAdminTokenPair.findFirst({
      orderBy: { issuedAt: "desc" },
      where: {
        accessTokenExpiresAt: { gt: new Date() },
        accessTokenHash: hashServiceAdminToken(accessToken),
        revokedAt: null,
        rotatedAt: null
      }
    });
    if (!tokenPair) {
      return undefined;
    }

    const session = await this.client.serviceAdminSession.findUnique({ where: { id: tokenPair.sessionId } });
    return session ? clone(toServiceAdminSession(session)) : undefined;
  }

  async findTenantOperatorSession(sessionId: string | undefined): Promise<StoredTenantOperatorSession | undefined> {
    const session = await this.findServiceAdminSession(sessionId);
    if (!session || !isTenantOperatorSession(session)) {
      return undefined;
    }

    return toTenantOperatorSession(session);
  }

  async findTenantOperatorSessionByAccessToken(accessToken: string): Promise<{
    permissions: string[];
    session: StoredTenantOperatorSession;
    user: IdentityTenantUser;
  } | undefined> {
    const session = await this.findServiceAdminSessionByAccessToken(accessToken);
    if (!session || !isTenantOperatorSession(session)) {
      return undefined;
    }
    if (session.revokedAt) {
      return undefined;
    }
    if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
      return undefined;
    }

    const user = await this.findTenantUser(session.adminId);
    if (!user || user.status !== "active") {
      return undefined;
    }

    return {
      permissions: [...session.allowedActions],
      session: toTenantOperatorSession(session),
      user
    };
  }

  async revokeServiceAdminSession(sessionId: string | undefined): Promise<StoredServiceAdminSession | undefined> {
    if (!sessionId) {
      return undefined;
    }

    const session = await this.client.serviceAdminSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return undefined;
    }

    const revoked = await this.client.serviceAdminSession.update({
      data: { revokedAt: new Date() },
      where: { id: sessionId }
    });

    return clone(toServiceAdminSession(revoked));
  }

  async revokeTenantOperatorSession(input: { sessionId?: string; token?: string }): Promise<boolean> {
    const token = String(input.token ?? "").trim();
    const sessionFromToken = token ? await this.findTenantOperatorSessionByAccessToken(token) : undefined;
    const sessionId = input.sessionId ?? sessionFromToken?.session.id;
    if (!sessionId) {
      return false;
    }

    const revokedSession = await this.revokeServiceAdminSession(sessionId);
    if (token) {
      await this.revokeServiceAdminToken({
        idempotencyKey: `top_revoke_${randomUUID()}`,
        revokedAt: new Date().toISOString(),
        tokenHash: hashServiceAdminToken(token)
      });
    }

    return Boolean(revokedSession);
  }

  async rotateServiceAdminRefreshToken(input: RotateServiceAdminRefreshTokenInput): Promise<IdentityServiceAdminTokenRotationResult | undefined> {
    if (input.nextAccessTokenHash === input.nextRefreshTokenHash) {
      return undefined;
    }

    const existingRotation = await this.client.serviceAdminTokenRotation.findUnique({
      include: { nextTokenPair: true, previousTokenPair: true },
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existingRotation) {
      return clone({
        next: toServiceAdminTokenPair(existingRotation.nextTokenPair),
        previous: toServiceAdminTokenPair(existingRotation.previousTokenPair),
        status: "duplicate" as const
      });
    }

    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.serviceAdminTokenPair.findFirst({
        where: {
          refreshTokenExpiresAt: { gt: new Date(input.rotatedAt) },
          refreshTokenHash: input.refreshTokenHash,
          revokedAt: null,
          rotatedAt: null
        }
      });
      if (!existing) {
        return undefined;
      }

      const conflict = await transaction.serviceAdminTokenPair.findFirst({
        where: toPrismaActiveTokenHashConflictWhere({
          accessTokenHash: input.nextAccessTokenHash,
          refreshTokenHash: input.nextRefreshTokenHash
        }, "")
      });
      if (conflict) {
        return undefined;
      }

      const previous = await transaction.serviceAdminTokenPair.update({
        data: { rotatedAt: new Date(input.rotatedAt) },
        where: { id: existing.id }
      });
      const next = await transaction.serviceAdminTokenPair.create({
        data: toPrismaServiceAdminTokenPairCreateInput({
          accessTokenExpiresAt: input.nextAccessTokenExpiresAt,
          accessTokenHash: input.nextAccessTokenHash,
          id: input.idempotencyKey,
          issuedAt: input.rotatedAt,
          refreshTokenExpiresAt: input.nextRefreshTokenExpiresAt,
          refreshTokenHash: input.nextRefreshTokenHash,
          sessionId: existing.sessionId,
          subjectId: existing.subjectId
        })
      });
      await transaction.serviceAdminTokenRotation.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          nextTokenPairId: next.id,
          previousTokenPairId: previous.id,
          rotatedAt: new Date(input.rotatedAt)
        }
      });

      return clone({
        next: toServiceAdminTokenPair(next),
        previous: toServiceAdminTokenPair(previous),
        status: "rotated" as const
      });
    });
  }

  async revokeServiceAdminToken(input: RevokeServiceAdminTokenInput): Promise<IdentityServiceAdminTokenRevokeResult | undefined> {
    const existingRevocation = await this.client.serviceAdminTokenRevocation.findUnique({
      include: { tokenPair: true },
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existingRevocation) {
      const tokenMatches = existingRevocation.tokenHash === input.tokenHash;
      return tokenMatches
        ? clone({
          idempotencyKey: existingRevocation.idempotencyKey,
          status: "duplicate" as const,
          token: toServiceAdminTokenPair(existingRevocation.tokenPair)
        })
        : undefined;
    }

    return this.client.$transaction(async (transaction) => {
      const existing = await transaction.serviceAdminTokenPair.findFirst({
        where: {
          OR: [
            { accessTokenHash: input.tokenHash },
            { refreshTokenHash: input.tokenHash }
          ],
          revokedAt: null
        }
      });
      if (!existing) {
        return undefined;
      }

      const token = await transaction.serviceAdminTokenPair.update({
        data: { revokedAt: new Date(input.revokedAt) },
        where: { id: existing.id }
      });
      await transaction.serviceAdminTokenRevocation.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          revokedAt: new Date(input.revokedAt),
          tokenHash: input.tokenHash,
          tokenPairId: existing.id
        }
      });

      return clone({
        idempotencyKey: input.idempotencyKey,
        status: "revoked" as const,
        token: toServiceAdminTokenPair(token)
      });
    });
  }

  async appendOutbox(event: OutboxEvent): Promise<OutboxEvent> {
    await this.client.outboxEvent.create({ data: toPrismaOutboxEventCreateInput(event) });
    return clone(event);
  }
}

function createDurableIdentityRepository(store: DurableStore<IdentityState>): IdentityRepositoryPort {
  return {
    listTenants(): IdentityTenant[] {
      return clone(store.read().tenants);
    },

    findTenant(tenantId: string): IdentityTenant | undefined {
      return clone(store.read().tenants.find((tenant) => tenant.id === tenantId));
    },

    saveTenant(tenant: IdentityTenant): IdentityTenant {
      const state = store.read();
      const existing = state.tenants.some((item) => item.id === tenant.id);
      const nextTenant = clone(tenant);
      store.write({
        ...state,
        tenants: existing
          ? state.tenants.map((item) => item.id === tenant.id ? nextTenant : item)
          : [...state.tenants, nextTenant]
      });
      return clone(nextTenant);
    },

    findTenantAuditEvents(tenantId: string): IdentityTenantAuditEvent[] {
      return clone(store.read().tenantAuditEvents.filter((event) => event.tenantId === tenantId));
    },

    findTenantUsers(tenantId: string): IdentityTenantUser[] {
      const state = store.read();
      return clone((state.tenantUsers ?? []).filter((user) => user.tenantId === tenantId));
    },

    findTenantUser(userId: string | undefined): IdentityTenantUser | undefined {
      if (!userId) {
        return undefined;
      }

      const state = store.read();
      return clone((state.tenantUsers ?? []).find((user) => user.id === userId));
    },

    findTenantUserByEmail(email: string): IdentityTenantUser | undefined {
      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return undefined;
      }

      const state = store.read();
      return clone((state.tenantUsers ?? []).find((user) => normalizeEmail(user.email) === normalizedEmail));
    },

    saveTenantUser(user: IdentityTenantUser): IdentityTenantUser {
      store.update((state) => {
        const currentTenantUsers = state.tenantUsers ?? [];
        return {
          ...state,
          tenantUsers: [
            user,
            ...currentTenantUsers.filter((item) => item.id !== user.id)
          ]
        };
      });

      return clone(user);
    },

    listServiceAdminAuditEvents(): IdentityServiceAdminAuditEvent[] {
      return clone(store.read().serviceAdminAuditEvents ?? []);
    },

    recordServiceAdminAuditEvent(event: IdentityServiceAdminAuditEvent): IdentityServiceAdminAuditEvent {
      store.update((state) => ({
        ...state,
        serviceAdminAuditEvents: [event, ...(state.serviceAdminAuditEvents ?? [])]
      }));

      return clone(event);
    },

    listServiceAdminAuditExports(): IdentityServiceAdminAuditExport[] {
      return clone(store.read().serviceAdminAuditExports ?? []);
    },

    recordServiceAdminAuditExport(exportRecord: IdentityServiceAdminAuditExport): IdentityServiceAdminAuditExport {
      store.update((state) => ({
        ...state,
        serviceAdminAuditExports: [exportRecord, ...(state.serviceAdminAuditExports ?? [])]
      }));

      return clone(exportRecord);
    },

    listServiceAdminAuditRedactions(): IdentityServiceAdminAuditRedaction[] {
      return clone(store.read().serviceAdminAuditRedactions ?? []);
    },

    recordServiceAdminAuditRedaction(redaction: IdentityServiceAdminAuditRedaction): IdentityServiceAdminAuditRedaction {
      store.update((state) => ({
        ...state,
        serviceAdminAuditRedactions: [redaction, ...(state.serviceAdminAuditRedactions ?? [])]
      }));

      return clone(redaction);
    },

    listPermissionRoles(): IdentityPermissionRole[] {
      const persistedRoles = store.read().permissionRoles;
      return clone(persistedRoles?.length ? persistedRoles : identityPermissionRoleCatalog);
    },

    listPrivilegedServiceAdminActions(): string[] {
      return clone(store.read().privilegedServiceAdminActions ?? serviceAdminPrivilegedActions);
    },

    listServiceAdminTariffs(): IdentityServiceAdminTariff[] {
      return clone(store.read().serviceAdminTariffs ?? identityServiceAdminTariffCatalog);
    },

    listServiceAdminIncidents(): IdentityServiceAdminIncident[] {
      return clone(store.read().serviceAdminIncidents ?? []);
    },

    listServiceAdminFeatureFlags(): IdentityServiceAdminFeatureFlag[] {
      return clone(store.read().serviceAdminFeatureFlags ?? []);
    },

    getActiveRbacPolicyVersion(): IdentityRbacPolicyVersion | undefined {
      const policies = store.read().rbacPolicyVersions ?? [];
      return clone(policies
        .filter((policy) => policy.status === "active")
        .sort(compareRbacPolicyVersionsForActiveSelection)[0]);
    },

    saveRbacPolicyVersion(policyVersion: IdentityRbacPolicyVersion): IdentityRbacPolicyVersion {
      store.update((state) => {
        const policies = state.rbacPolicyVersions ?? [];
        const nextPolicies = policyVersion.status === "active"
          ? policies.map((policy) => policy.id === policyVersion.id || policy.status !== "active"
            ? policy
            : { ...policy, status: "retired" as const })
          : policies;
        return {
          ...state,
          rbacPolicyVersions: [
            policyVersion,
            ...nextPolicies.filter((policy) => policy.id !== policyVersion.id)
          ]
        };
      });

      return clone(policyVersion);
    },

    recordRbacRoleGrant(grant: IdentityRbacRoleGrant): IdentityRbacRoleGrant {
      store.update((state) => ({
        ...state,
        rbacRoleGrants: [grant, ...(state.rbacRoleGrants ?? [])]
      }));

      return clone(grant);
    },

    listRbacRoleGrants(input: ListRbacRoleGrantsInput = {}): IdentityRbacRoleGrant[] {
      return clone((store.read().rbacRoleGrants ?? [])
        .filter((grant) => input.policyVersionId === undefined || grant.policyVersionId === input.policyVersionId)
        .filter((grant) => input.roleKey === undefined || grant.roleKey === input.roleKey)
        .filter((grant) => input.tenantId === undefined || grant.tenantId === input.tenantId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)));
    },

    recordPermissionDenialEvent(event: IdentityPermissionDenialEvent): IdentityPermissionDenialEvent {
      store.update((state) => ({
        ...state,
        permissionDenialEvents: [event, ...(state.permissionDenialEvents ?? [])]
      }));

      return clone(event);
    },

    listPermissionDenialEvents(input: ListPermissionDenialEventsInput = {}): IdentityPermissionDenialEvent[] {
      return clone((store.read().permissionDenialEvents ?? [])
        .filter((event) => input.tenantId === undefined || event.tenantId === input.tenantId)
        .sort((left, right) => right.at.localeCompare(left.at)));
    },

    applyServiceAdminUserAction({ auditEvent, changes, userId }: ServiceAdminUserActionInput): {
      auditEvent: IdentityServiceAdminAuditEvent;
      user: IdentityTenantUser;
    } {
      let result: { auditEvent: IdentityServiceAdminAuditEvent; user: IdentityTenantUser } | null = null;

      store.update((state) => {
        const currentTenantUsers = state.tenantUsers ?? [];
        const existing = currentTenantUsers.find((user) => user.id === userId);
        if (!existing) {
          throw new Error(`User ${userId} was not found.`);
        }

        const updatedUser = { ...existing, ...changes };
        result = { auditEvent, user: updatedUser };

        return {
          ...state,
          serviceAdminAuditEvents: [auditEvent, ...(state.serviceAdminAuditEvents ?? [])],
          tenantUsers: currentTenantUsers.map((user) => user.id === userId ? updatedUser : user)
        };
      });

      if (!result) {
        throw new Error(`User ${userId} action was not persisted.`);
      }

      return clone(result);
    },

    createServiceAdminImpersonation({ auditEvent, session }: CreateServiceAdminImpersonationInput): {
      auditEvent: IdentityServiceAdminAuditEvent;
      session: IdentityServiceAdminImpersonationSession;
    } {
      store.update((state) => {
        const currentSessions = state.serviceAdminImpersonations ?? [];
        const startedAt = Date.parse(session.startedAt);
        const active = currentSessions.find((item) => (
          item.tenantId === session.tenantId
          && item.userId === session.userId
          && !item.stoppedAt
          && Date.parse(item.expiresAt) > startedAt
        ));
        if (active) {
          throw new ActiveServiceAdminImpersonationError(session.tenantId, session.userId);
        }

        return {
          ...state,
          serviceAdminAuditEvents: [auditEvent, ...(state.serviceAdminAuditEvents ?? [])],
          serviceAdminImpersonations: [session, ...currentSessions]
        };
      });

      return clone({ auditEvent, session });
    },

    findActiveServiceAdminImpersonation({ now = new Date(), tenantId, userId }: FindActiveServiceAdminImpersonationInput): IdentityServiceAdminImpersonationSession | undefined {
      const currentTime = now.getTime();
      const session = (store.read().serviceAdminImpersonations ?? []).find((item) => (
        item.tenantId === tenantId
        && item.userId === userId
        && !item.stoppedAt
        && Date.parse(item.expiresAt) > currentTime
      ));

      return clone(session);
    },

    findServiceAdminImpersonation(impersonationId: string | undefined): IdentityServiceAdminImpersonationSession | undefined {
      if (!impersonationId) {
        return undefined;
      }

      return clone((store.read().serviceAdminImpersonations ?? []).find((session) => session.id === impersonationId));
    },

    stopServiceAdminImpersonation({ auditEvent, impersonationId, stoppedAt }: StopServiceAdminImpersonationInput): {
      auditEvent: IdentityServiceAdminAuditEvent;
      session: IdentityServiceAdminImpersonationSession;
    } {
      let result: { auditEvent: IdentityServiceAdminAuditEvent; session: IdentityServiceAdminImpersonationSession } | null = null;

      store.update((state) => {
        const currentSessions = state.serviceAdminImpersonations ?? [];
        const existing = currentSessions.find((session) => session.id === impersonationId);
        if (!existing) {
          throw new Error(`Impersonation ${impersonationId} was not found.`);
        }

        const updatedSession = {
          ...existing,
          stoppedAt,
          stopAuditEvent: auditEvent
        };
        result = { auditEvent, session: updatedSession };

        return {
          ...state,
          serviceAdminAuditEvents: [auditEvent, ...(state.serviceAdminAuditEvents ?? [])],
          serviceAdminImpersonations: currentSessions.map((session) => session.id === impersonationId ? updatedSession : session)
        };
      });

      if (!result) {
        throw new Error(`Impersonation ${impersonationId} stop was not persisted.`);
      }

      return clone(result);
    },

    createBreakGlassApproval({ approval, auditEvent }: CreateBreakGlassApprovalInput): {
      approval: IdentityBreakGlassApproval;
      auditEvent: IdentityServiceAdminAuditEvent;
    } {
      store.update((state) => ({
        ...state,
        breakGlassApprovals: [approval, ...(state.breakGlassApprovals ?? [])],
        serviceAdminAuditEvents: [auditEvent, ...(state.serviceAdminAuditEvents ?? [])]
      }));

      return clone({ approval, auditEvent });
    },

    findBreakGlassApproval(approvalId: string | undefined): IdentityBreakGlassApproval | undefined {
      if (!approvalId) {
        return undefined;
      }

      return clone((store.read().breakGlassApprovals ?? []).find((approval) => approval.id === approvalId));
    },

    decideBreakGlassApproval({ approvalId, auditEvent, status }: DecideBreakGlassApprovalInput): {
      approval: IdentityBreakGlassApproval;
      auditEvent: IdentityServiceAdminAuditEvent;
    } {
      let result: { approval: IdentityBreakGlassApproval; auditEvent: IdentityServiceAdminAuditEvent } | null = null;

      store.update((state) => {
        const currentApprovals = state.breakGlassApprovals ?? [];
        const existing = currentApprovals.find((approval) => approval.id === approvalId);
        if (!existing) {
          throw new Error(`Break-glass approval ${approvalId} was not found.`);
        }
        if (existing.status !== "pending") {
          throw new Error(`Break-glass approval ${approvalId} was not pending.`);
        }

        const updatedApproval: IdentityBreakGlassApproval = { ...existing, status };
        result = { approval: updatedApproval, auditEvent };

        return {
          ...state,
          breakGlassApprovals: currentApprovals.map((approval) => approval.id === approvalId ? updatedApproval : approval),
          serviceAdminAuditEvents: [auditEvent, ...(state.serviceAdminAuditEvents ?? [])]
        };
      });

      if (!result) {
        throw new Error(`Break-glass approval ${approvalId} decision was not persisted.`);
      }

      return clone(result);
    },

    updateTenantStatus({ reason, status, tenantId, traceId }: TenantStatusChangeInput): {
      auditEvent: IdentityTenantAuditEvent;
      outbox: OutboxEvent;
      tenant: IdentityTenant;
    } {
      let result: { auditEvent: IdentityTenantAuditEvent; outbox: OutboxEvent; tenant: IdentityTenant } | null = null;

      store.update((state) => {
        const tenant = state.tenants.find((item) => item.id === tenantId);
        if (!tenant) {
          throw new Error(`Tenant ${tenantId} was not found.`);
        }

        const normalizedStatus = tenantStatusFromRow(status);
        const updatedTenant: IdentityTenant = { ...tenant, status: normalizedStatus };
        const auditEvent = {
          id: makeAuditId("tenant_status"),
          action: "tenant.status.change",
          actor: "Service Admin",
          at: new Date().toISOString(),
          immutable: true,
          reason,
          result: "ok",
          severity: normalizedStatus === "restricted" ? "warn" : "info",
          target: tenant.id,
          tenantId: tenant.id,
          traceId
        };
        const outbox = createOutboxEvent({
          aggregateId: tenant.id,
          aggregateType: "tenant",
          payload: { from: tenant.status, reason, status: normalizedStatus },
          queue: "identity-events",
          traceId,
          type: "tenant.status.changed"
        });

        result = { auditEvent, outbox, tenant: updatedTenant };

        return {
          ...state,
          outbox: [...state.outbox, outbox],
          tenantAuditEvents: [...state.tenantAuditEvents, auditEvent],
          tenants: state.tenants.map((item) => item.id === tenant.id ? updatedTenant : item)
        };
      });

      if (!result) {
        throw new Error(`Tenant ${tenantId} status change was not persisted.`);
      }

      return clone(result);
    },

    createMfaChallenge(input: CreateMfaChallengeInput): IdentityMfaChallenge {
      const challenge = {
        attempts: 0,
        id: makeMfaChallengeId(),
        consumedAt: null,
        createdAt: new Date().toISOString(),
        email: normalizeEmail(input.email),
        expiresAt: addMinutes(new Date(), 10).toISOString(),
        maxAttempts: input.maxAttempts ?? 5,
        otpHash: input.otpHash
      };

      store.update((state) => ({
        ...state,
        mfaChallenges: [...state.mfaChallenges, challenge]
      }));

      return clone(challenge);
    },

    createInviteToken(input: CreateInviteTokenInput): IdentityAuthInviteToken {
      const now = new Date();
      const code = String(input.code ?? `invite_${randomUUID()}`).trim();
      const token: IdentityAuthInviteToken = {
        code,
        consumedAt: null,
        createdAt: now.toISOString(),
        email: normalizeEmail(input.email),
        expiresAt: input.expiresAt ?? addMinutes(now, 60 * 24 * 7).toISOString(),
        id: `inv_${randomUUID()}`,
        tenantId: input.tenantId
      };
      const record: IdentityAuthInviteTokenRecord = {
        codeHash: hashAuthFlowToken(code),
        consumedAt: token.consumedAt,
        createdAt: token.createdAt,
        email: token.email,
        expiresAt: token.expiresAt,
        id: token.id,
        tenantId: token.tenantId
      };

      store.update((state) => {
        const tokens = state.authInviteTokens ?? [];
        const existing = tokens.find((item) => item.codeHash === record.codeHash);
        const nextRecord = existing ? { ...record, id: existing.id, createdAt: existing.createdAt } : record;
        return {
          ...state,
          authInviteTokens: [
            nextRecord,
            ...tokens.filter((item) => item.codeHash !== record.codeHash)
          ]
        };
      });

      return clone(token);
    },

    createRecoveryToken(email: string): IdentityAuthRecoveryToken {
      const now = new Date();
      const tokenValue = `recovery_${randomUUID()}`;
      const token: IdentityAuthRecoveryToken = {
        consumedAt: null,
        createdAt: now.toISOString(),
        email: normalizeEmail(email),
        expiresAt: addMinutes(now, 30).toISOString(),
        id: `rcv_${randomUUID()}`,
        token: tokenValue
      };
      const record: IdentityAuthRecoveryTokenRecord = {
        consumedAt: token.consumedAt,
        createdAt: token.createdAt,
        email: token.email,
        expiresAt: token.expiresAt,
        id: token.id,
        tokenHash: hashAuthFlowToken(tokenValue)
      };

      store.update((state) => {
        const tokens = state.authRecoveryTokens ?? [];
        const existing = tokens.find((item) => item.tokenHash === record.tokenHash);
        const nextRecord = existing ? { ...record, id: existing.id, createdAt: existing.createdAt } : record;
        return {
          ...state,
          authRecoveryTokens: [
            nextRecord,
            ...tokens.filter((item) => item.tokenHash !== record.tokenHash)
          ]
        };
      });

      return clone(token);
    },

    createTenantOperatorSession(input: CreateTenantOperatorSessionInput): CreateTenantOperatorSessionResult {
      const user = clone((store.read().tenantUsers ?? []).find((item) => item.id === input.userId));
      if (!user || user.status !== "active" || user.tenantId !== input.tenantId) {
        throw new Error(`Tenant operator ${input.userId} is unavailable for tenant ${input.tenantId}.`);
      }

      const storedPermissionRoles = store.read().permissionRoles;
      const permissions = resolveTenantOperatorPermissions(user.role, storedPermissionRoles?.length ? storedPermissionRoles : identityPermissionRoleCatalog);
      const now = new Date();
      const session: StoredServiceAdminSession = {
        actorId: user.id,
        actorName: user.name,
        adminEmail: user.email,
        adminId: user.id,
        adminName: user.name,
        allowedActions: permissions,
        authState: "mfa_verified",
        availableOrganizations: [{ id: user.tenantId, name: user.tenantId, role: "operator" }],
        currentTenantId: user.tenantId,
        role: user.role,
        tenantScope: user.tenantId,
        id: `top-session_${randomUUID()}`,
        expiresAt: addMinutes(now, 60).toISOString(),
        mfaVerifiedAt: now.toISOString(),
        revokedAt: null
      };
      store.update((state) => ({
        ...state,
        serviceAdminSessions: [...state.serviceAdminSessions, session]
      }));
      const tokenPair = createTenantOperatorSessionTokens({
        hashToken: hashServiceAdminToken,
        sessionId: session.id,
        subjectId: user.id
      });
      const existingPairs = store.read().serviceAdminTokenPairs ?? [];
      if (hasActiveServiceAdminTokenHashConflict(existingPairs, {
        accessTokenHash: tokenPair.accessTokenHash,
        refreshTokenHash: tokenPair.refreshTokenHash
      }, tokenPair.id)) {
        throw new Error("Service-admin token hash conflict.");
      }
      const persistedPair: IdentityServiceAdminTokenPair = {
        accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
        accessTokenHash: tokenPair.accessTokenHash,
        id: tokenPair.id,
        issuedAt: tokenPair.issuedAt,
        refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
        refreshTokenHash: tokenPair.refreshTokenHash,
        revokedAt: null,
        rotatedAt: null,
        sessionId: tokenPair.sessionId,
        subjectId: tokenPair.subjectId
      };
      store.update((state) => ({
        ...state,
        serviceAdminTokenPairs: [
          persistedPair,
          ...(state.serviceAdminTokenPairs ?? []).filter((item) => item.id !== persistedPair.id)
        ]
      }));

      return clone({
        accessToken: tokenPair.accessToken,
        expiresAt: tokenPair.accessTokenExpiresAt,
        refreshToken: tokenPair.refreshToken,
        sessionId: session.id
      });
    },

    consumeMfaChallenge({ challengeId, email, now = new Date(), otpHash }: ConsumeMfaChallengeInput): MfaChallengeConsumeResult {
      if (!challengeId) {
        return {
          code: "mfa_challenge_required",
          message: "MFA challenge id is required to complete login.",
          valid: false
        };
      }

      let result: MfaChallengeConsumeResult | null = null;
      store.update((state) => {
        const challenge = state.mfaChallenges.find((item) => item.id === challengeId);
        if (!challenge) {
          result = {
            code: "mfa_challenge_not_found",
            message: "MFA challenge was not found.",
            valid: false
          };
          return state;
        }

        const denial = resolveMfaChallengeDenial(challenge, email, now);
        if (denial) {
          result = denial;
          return state;
        }

        if (!secureStringEqual(challenge.otpHash, otpHash)) {
          result = {
            code: "mfa_otp_invalid",
            message: "MFA one-time code is invalid.",
            valid: false
          };
          return {
            ...state,
            mfaChallenges: state.mfaChallenges.map((item) => item.id === challenge.id
              ? { ...item, attempts: (item.attempts ?? 0) + 1 }
              : item)
          };
        }

        const consumedChallenge = { ...challenge, consumedAt: now.toISOString() };
        result = {
          challenge: consumedChallenge,
          valid: true
        };

        return {
          ...state,
          mfaChallenges: state.mfaChallenges.map((item) => item.id === challenge.id ? consumedChallenge : item)
        };
      });

      if (!result) {
        throw new Error(`MFA challenge ${challengeId} consume result was not persisted.`);
      }

      return clone(result);
    },

    consumeInviteToken({ code, email, now = new Date() }: ConsumeInviteTokenInput): InviteTokenConsumeResult {
      const normalizedCode = String(code ?? "").trim();
      let result: InviteTokenConsumeResult | null = null;
      store.update((state) => {
        const tokens = state.authInviteTokens ?? [];
        const token = tokens.find((item) => item.codeHash === hashAuthFlowToken(normalizedCode));
        if (!token) {
          result = { code: "invite_not_found", message: "Invite token was not found.", status: "denied" };
          return state;
        }

        if (token.consumedAt) {
          result = { code: "invite_expired", message: "Invite token was already consumed.", status: "denied" };
          return state;
        }

        if (!Number.isFinite(Date.parse(token.expiresAt)) || Date.parse(token.expiresAt) <= now.getTime()) {
          result = { code: "invite_expired", message: "Invite token has expired.", status: "denied" };
          return state;
        }

        if (normalizeEmail(email) !== token.email) {
          result = { code: "invite_email_mismatch", message: "Invite email does not match the token.", status: "denied" };
          return state;
        }

        const consumedRecord = { ...token, consumedAt: now.toISOString() };
        result = {
          status: "consumed",
          token: {
            code: normalizedCode,
            consumedAt: consumedRecord.consumedAt,
            createdAt: consumedRecord.createdAt,
            email: consumedRecord.email,
            expiresAt: consumedRecord.expiresAt,
            id: consumedRecord.id,
            tenantId: consumedRecord.tenantId
          }
        };

        return {
          ...state,
          authInviteTokens: tokens.map((item) => item.id === token.id ? consumedRecord : item)
        };
      });

      if (!result) {
        throw new Error("Invite token consume result was not persisted.");
      }

      return clone(result);
    },

    findMfaChallenge(challengeId: string | undefined): IdentityMfaChallenge | undefined {
      if (!challengeId) {
        return undefined;
      }

      return clone(store.read().mfaChallenges.find((challenge) => challenge.id === challengeId));
    },

    findPasswordCredentialByEmail(email: string): IdentityPasswordCredential | undefined {
      const normalizedEmail = normalizeEmail(email);
      return clone((store.read().passwordCredentials ?? []).find((credential) => normalizeEmail(credential.email) === normalizedEmail));
    },

    savePasswordCredential(credential: IdentityPasswordCredential): IdentityPasswordCredential {
      const normalizedCredential = {
        ...credential,
        email: normalizeEmail(credential.email)
      };

      store.update((state) => {
        const credentials = state.passwordCredentials ?? [];
        return {
          ...state,
          passwordCredentials: [
            normalizedCredential,
            ...credentials.filter((item) => normalizeEmail(item.email) !== normalizedCredential.email)
          ]
        };
      });

      return clone(normalizedCredential);
    },

    consumeRecoveryToken({ email, now = new Date(), token }: ConsumeRecoveryTokenInput): RecoveryTokenConsumeResult {
      const normalizedToken = String(token ?? "").trim();
      let result: RecoveryTokenConsumeResult | null = null;
      store.update((state) => {
        const tokens = state.authRecoveryTokens ?? [];
        const record = tokens.find((item) => item.tokenHash === hashAuthFlowToken(normalizedToken));
        if (!record) {
          result = { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" };
          return state;
        }

        if (record.consumedAt || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now.getTime()) {
          result = { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" };
          return state;
        }

        if (normalizeEmail(email) !== record.email) {
          result = { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" };
          return state;
        }

        const consumedRecord = { ...record, consumedAt: now.toISOString() };
        result = {
          status: "consumed",
          token: {
            consumedAt: consumedRecord.consumedAt,
            createdAt: consumedRecord.createdAt,
            email: consumedRecord.email,
            expiresAt: consumedRecord.expiresAt,
            id: consumedRecord.id,
            token: normalizedToken
          }
        };

        return {
          ...state,
          authRecoveryTokens: tokens.map((item) => item.id === record.id ? consumedRecord : item)
        };
      });

      if (!result) {
        throw new Error("Recovery token consume result was not persisted.");
      }

      return clone(result);
    },

    completePasswordRecovery({ credential, email, now = new Date(), token }: CompletePasswordRecoveryInput): PasswordRecoveryCompletionResult {
      const normalizedEmail = normalizeEmail(email);
      if (normalizeEmail(credential.email) !== normalizedEmail) {
        throw new Error("password_recovery_credential_email_mismatch");
      }

      const normalizedToken = String(token ?? "").trim();
      let result: PasswordRecoveryCompletionResult | null = null;
      store.update((state) => {
        const tokens = state.authRecoveryTokens ?? [];
        const record = tokens.find((item) => item.tokenHash === hashAuthFlowToken(normalizedToken));
        if (!record || normalizeEmail(record.email) !== normalizedEmail) {
          result = { code: "recovery_not_found", message: "Recovery token was not found.", status: "denied" };
          return state;
        }
        if (record.consumedAt || !Number.isFinite(Date.parse(record.expiresAt)) || Date.parse(record.expiresAt) <= now.getTime()) {
          result = { code: "recovery_expired", message: "Recovery token has expired.", status: "denied" };
          return state;
        }

        const revokedAt = now.toISOString();
        const activeSessionIds = new Set(state.serviceAdminSessions
          .filter((session) => normalizeEmail(session.adminEmail) === normalizedEmail && !session.revokedAt)
          .map((session) => session.id));
        const revokedTokenPairs = (state.serviceAdminTokenPairs ?? [])
          .filter((pair) => activeSessionIds.has(pair.sessionId) && !pair.revokedAt)
          .length;
        const normalizedCredential = {
          ...credential,
          email: normalizedEmail
        };
        result = {
          credential: normalizedCredential,
          revokedSessions: activeSessionIds.size,
          revokedTokenPairs,
          status: "consumed"
        };

        return {
          ...state,
          authRecoveryTokens: tokens.map((item) => item.id === record.id ? { ...item, consumedAt: revokedAt } : item),
          passwordCredentials: [
            normalizedCredential,
            ...(state.passwordCredentials ?? []).filter((item) => normalizeEmail(item.email) !== normalizedEmail)
          ],
          serviceAdminSessions: state.serviceAdminSessions.map((session) => activeSessionIds.has(session.id)
            ? { ...session, revokedAt }
            : session),
          serviceAdminTokenPairs: (state.serviceAdminTokenPairs ?? []).map((pair) => (
            activeSessionIds.has(pair.sessionId) && !pair.revokedAt
              ? { ...pair, revokedAt }
              : pair
          ))
        };
      });

      if (!result) {
        throw new Error("Password recovery result was not persisted.");
      }
      return clone(result);
    },

    getPasswordPolicy(scope: string): IdentityPasswordPolicy | undefined {
      return clone((store.read().passwordPolicies ?? []).find((policy) => policy.scope === scope));
    },

    savePasswordPolicy(policy: IdentityPasswordPolicy): IdentityPasswordPolicy {
      store.update((state) => {
        const policies = state.passwordPolicies ?? [];
        return {
          ...state,
          passwordPolicies: [
            policy,
            ...policies.filter((item) => item.scope !== policy.scope)
          ]
        };
      });

      return clone(policy);
    },

    recordCredentialAuditEvent(event: IdentityCredentialAuditEvent): IdentityCredentialAuditEvent {
      store.update((state) => ({
        ...state,
        credentialAuditEvents: [event, ...(state.credentialAuditEvents ?? [])]
      }));

      return clone(event);
    },

    listCredentialAuditEvents(subjectId: string): IdentityCredentialAuditEvent[] {
      return clone((store.read().credentialAuditEvents ?? []).filter((event) => event.subjectId === subjectId));
    },

    saveOidcProviderConfig(config: IdentityOidcProviderConfig): IdentityOidcProviderConfig {
      const normalizedConfig = {
        ...config,
        scopes: [...config.scopes]
      };
      store.update((state) => {
        const configs = state.oidcProviderConfigs ?? [];
        return {
          ...state,
          oidcProviderConfigs: [
            normalizedConfig,
            ...configs.filter((item) => item.providerId !== normalizedConfig.providerId)
          ]
        };
      });

      return clone(normalizedConfig);
    },

    findOidcProviderConfig(providerId: string): IdentityOidcProviderConfig | undefined {
      return clone((store.read().oidcProviderConfigs ?? []).find((config) => config.providerId === providerId));
    },

    recordOidcCallbackDescriptor(descriptor: IdentityOidcCallbackDescriptor): IdentityOidcCallbackDescriptor {
      store.update((state) => {
        const descriptors = state.oidcCallbackDescriptors ?? [];
        if (descriptors.some((item) => item.id === descriptor.id || item.state === descriptor.state)) {
          throw new Error("OIDC callback descriptor already exists.");
        }

        return {
          ...state,
          oidcCallbackDescriptors: [descriptor, ...descriptors]
        };
      });

      return clone(descriptor);
    },

    findOidcCallbackDescriptor(state: string): IdentityOidcCallbackDescriptor | undefined {
      return clone((store.read().oidcCallbackDescriptors ?? []).find((descriptor) => descriptor.state === state));
    },

    consumeOidcCallbackDescriptor({ now = new Date(), state }: ConsumeOidcCallbackDescriptorInput): OidcCallbackDescriptorConsumeResult {
      if (!state) {
        return {
          code: "oidc_callback_state_required",
          message: "OIDC callback state is required.",
          status: "missing"
        };
      }

      let result: OidcCallbackDescriptorConsumeResult | null = null;
      store.update((identityState) => {
        const descriptors = identityState.oidcCallbackDescriptors ?? [];
        const descriptor = descriptors.find((item) => item.state === state);
        if (!descriptor) {
          result = {
            code: "oidc_callback_not_found",
            message: "OIDC callback descriptor was not found.",
            status: "missing"
          };
          return identityState;
        }

        if (descriptor.consumedAt) {
          result = {
            code: "oidc_callback_replayed",
            descriptor,
            message: "OIDC callback descriptor was already consumed.",
            status: "replayed"
          };
          return identityState;
        }

        if (!Number.isFinite(Date.parse(descriptor.expiresAt)) || Date.parse(descriptor.expiresAt) <= now.getTime()) {
          result = {
            code: "oidc_callback_expired",
            descriptor,
            message: "OIDC callback descriptor has expired.",
            status: "expired"
          };
          return identityState;
        }

        const consumedDescriptor = { ...descriptor, consumedAt: now.toISOString() };
        result = {
          descriptor: consumedDescriptor,
          status: "consumed"
        };

        return {
          ...identityState,
          oidcCallbackDescriptors: descriptors.map((item) => item.state === state ? consumedDescriptor : item)
        };
      });

      if (!result) {
        throw new Error(`OIDC callback descriptor ${state} consume result was not persisted.`);
      }

      return clone(result);
    },

    saveSamlProviderMetadata(metadata: IdentitySamlProviderMetadata): IdentitySamlProviderMetadata {
      store.update((state) => {
        const providers = state.samlProviderMetadata ?? [];
        return {
          ...state,
          samlProviderMetadata: [
            metadata,
            ...providers.filter((item) => item.providerId !== metadata.providerId)
          ]
        };
      });

      return clone(metadata);
    },

    findSamlProviderMetadata(providerId: string): IdentitySamlProviderMetadata | undefined {
      return clone((store.read().samlProviderMetadata ?? []).find((provider) => provider.providerId === providerId));
    },

    recordSamlAcsRequestDescriptor(descriptor: IdentitySamlAcsRequestDescriptor): IdentitySamlAcsRequestDescriptor {
      store.update((state) => {
        const descriptors = state.samlAcsRequestDescriptors ?? [];
        if (descriptors.some((item) => item.id === descriptor.id || item.requestId === descriptor.requestId || item.relayState === descriptor.relayState)) {
          throw new Error("SAML ACS request descriptor already exists.");
        }

        return {
          ...state,
          samlAcsRequestDescriptors: [descriptor, ...descriptors]
        };
      });

      return clone(descriptor);
    },

    findSamlAcsRequestDescriptor(requestId: string): IdentitySamlAcsRequestDescriptor | undefined {
      return clone((store.read().samlAcsRequestDescriptors ?? []).find((descriptor) => descriptor.requestId === requestId));
    },

    consumeSamlAcsRequestDescriptor({ now = new Date(), requestId }: ConsumeSamlAcsRequestDescriptorInput): SamlAcsRequestDescriptorConsumeResult {
      if (!requestId) {
        return {
          code: "saml_acs_request_required",
          message: "SAML ACS request id is required.",
          status: "missing"
        };
      }

      let result: SamlAcsRequestDescriptorConsumeResult | null = null;
      store.update((identityState) => {
        const descriptors = identityState.samlAcsRequestDescriptors ?? [];
        const descriptor = descriptors.find((item) => item.requestId === requestId);
        if (!descriptor) {
          result = {
            code: "saml_acs_request_not_found",
            message: "SAML ACS request descriptor was not found.",
            status: "missing"
          };
          return identityState;
        }

        if (descriptor.consumedAt) {
          result = {
            code: "saml_acs_request_replayed",
            descriptor,
            message: "SAML ACS request descriptor was already consumed.",
            status: "replayed"
          };
          return identityState;
        }

        if (!Number.isFinite(Date.parse(descriptor.expiresAt)) || Date.parse(descriptor.expiresAt) <= now.getTime()) {
          result = {
            code: "saml_acs_request_expired",
            descriptor,
            message: "SAML ACS request descriptor has expired.",
            status: "expired"
          };
          return identityState;
        }

        const consumedDescriptor = { ...descriptor, consumedAt: now.toISOString() };
        result = {
          descriptor: consumedDescriptor,
          status: "consumed"
        };

        return {
          ...identityState,
          samlAcsRequestDescriptors: descriptors.map((item) => item.requestId === requestId ? consumedDescriptor : item)
        };
      });

      if (!result) {
        throw new Error(`SAML ACS request descriptor ${requestId} consume result was not persisted.`);
      }

      return clone(result);
    },

    recordSamlAssertionReplay(replay: IdentitySamlAssertionReplay): IdentitySamlAssertionReplay {
      store.update((state) => {
        const replays = state.samlAssertionReplays ?? [];
        if (replays.some((item) => item.providerId === replay.providerId && item.assertionId === replay.assertionId)) {
          throw new Error("SAML assertion replay already exists.");
        }

        return {
          ...state,
          samlAssertionReplays: [replay, ...replays]
        };
      });

      return clone(replay);
    },

    findSamlAssertionReplay(providerId: string, assertionId: string): IdentitySamlAssertionReplay | undefined {
      return clone((store.read().samlAssertionReplays ?? []).find((replay) => replay.providerId === providerId && replay.assertionId === assertionId));
    },

    createServiceAdminSession(input: CreateServiceAdminSessionInput = {}): StoredServiceAdminSession {
      const resolved = resolveServiceAdminSessionInput(input);
      const now = new Date();
      const session: StoredServiceAdminSession = {
        actorId: resolved.actorId,
        actorName: resolved.actorName,
        adminEmail: resolved.adminEmail,
        adminId: resolved.actorId,
        adminName: resolved.actorName,
        allowedActions: resolved.allowedActions,
        authState: "mfa_verified",
        availableOrganizations: resolved.availableOrganizations,
        currentTenantId: resolved.currentTenantId,
        role: resolved.role,
        tenantScope: resolved.tenantScope,
        id: `${input.sessionIdPrefix ?? "svc-session"}_${randomUUID()}`,
        expiresAt: addMinutes(now, input.ttlMinutes ?? 240).toISOString(),
        mfaVerifiedAt: input.mfaVerified === false ? null : now.toISOString(),
        revokedAt: null
      };

      store.update((state) => ({
        ...state,
        serviceAdminSessions: [...state.serviceAdminSessions, session]
      }));

      return clone(session);
    },

    createServiceAdminTokenPair(input: CreateServiceAdminTokenPairInput): IdentityServiceAdminTokenPair {
      const existingPairs = store.read().serviceAdminTokenPairs ?? [];
      if (input.accessTokenHash === input.refreshTokenHash) {
        throw new Error("Service-admin token hash conflict.");
      }

      const existingPair = existingPairs.find((item) => item.id === input.id);
      if (existingPair) {
        if (serviceAdminTokenPairMatchesInput(existingPair, input)) {
          return clone(existingPair);
        }

        throw new Error("Service-admin token pair id conflict.");
      }

      if (hasActiveServiceAdminTokenHashConflict(existingPairs, {
        accessTokenHash: input.accessTokenHash,
        refreshTokenHash: input.refreshTokenHash
      }, input.id)) {
        throw new Error("Service-admin token hash conflict.");
      }

      const tokenPair: IdentityServiceAdminTokenPair = {
        ...input,
        revokedAt: null,
        rotatedAt: null
      };

      store.update((state) => ({
        ...state,
        serviceAdminTokenPairs: [
          tokenPair,
          ...(state.serviceAdminTokenPairs ?? []).filter((item) => item.id !== tokenPair.id)
        ]
      }));

      return clone(tokenPair);
    },

    findServiceAdminSession(sessionId: string | undefined): StoredServiceAdminSession | undefined {
      if (!sessionId) {
        return undefined;
      }

      return clone(store.read().serviceAdminSessions.find((session) => session.id === sessionId));
    },

    findServiceAdminSessionByAccessToken(accessToken: string): StoredServiceAdminSession | undefined {
      const tokenHash = hashServiceAdminToken(accessToken);
      const now = Date.now();
      const tokenPair = (store.read().serviceAdminTokenPairs ?? []).find((item) => (
        item.accessTokenHash === tokenHash
        && !item.revokedAt
        && !item.rotatedAt
        && Number.isFinite(Date.parse(item.accessTokenExpiresAt))
        && Date.parse(item.accessTokenExpiresAt) > now
      ));
      if (!tokenPair) {
        return undefined;
      }

      return clone(store.read().serviceAdminSessions.find((session) => session.id === tokenPair.sessionId));
    },

    findTenantOperatorSession(sessionId: string | undefined): StoredTenantOperatorSession | undefined {
      if (!sessionId) {
        return undefined;
      }
      const session = clone(store.read().serviceAdminSessions.find((item) => item.id === sessionId));
      if (!session || !isTenantOperatorSession(session)) {
        return undefined;
      }

      return clone(toTenantOperatorSession(session));
    },

    findTenantOperatorSessionByAccessToken(accessToken: string): {
      permissions: string[];
      session: StoredTenantOperatorSession;
      user: IdentityTenantUser;
    } | undefined {
      const tokenHash = hashServiceAdminToken(accessToken);
      const now = Date.now();
      const tokenPair = (store.read().serviceAdminTokenPairs ?? []).find((item) => (
        item.accessTokenHash === tokenHash
        && !item.revokedAt
        && !item.rotatedAt
        && Number.isFinite(Date.parse(item.accessTokenExpiresAt))
        && Date.parse(item.accessTokenExpiresAt) > now
      ));
      if (!tokenPair) {
        return undefined;
      }
      const session = clone(store.read().serviceAdminSessions.find((item) => item.id === tokenPair.sessionId));
      if (!session || !isTenantOperatorSession(session)) {
        return undefined;
      }
      if (session.revokedAt) {
        return undefined;
      }
      if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
        return undefined;
      }

      const user = clone((store.read().tenantUsers ?? []).find((item) => item.id === session.adminId));
      if (!user || user.status !== "active") {
        return undefined;
      }

      return clone({
        permissions: [...session.allowedActions],
        session: toTenantOperatorSession(session),
        user
      });
    },

    revokeServiceAdminSession(sessionId: string | undefined): StoredServiceAdminSession | undefined {
      if (!sessionId) {
        return undefined;
      }

      let revoked: StoredServiceAdminSession | undefined;
      store.update((state) => ({
        ...state,
        serviceAdminSessions: state.serviceAdminSessions.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }

          revoked = { ...session, revokedAt: new Date().toISOString() };
          return revoked;
        })
      }));

      return clone(revoked);
    },

    revokeTenantOperatorSession(input: { sessionId?: string; token?: string }): boolean {
      const token = String(input.token ?? "").trim();
      const sessionFromToken = token ? (() => {
        const tokenHash = hashServiceAdminToken(token);
        const now = Date.now();
        const tokenPair = (store.read().serviceAdminTokenPairs ?? []).find((item) => (
          item.accessTokenHash === tokenHash
          && !item.revokedAt
          && !item.rotatedAt
          && Number.isFinite(Date.parse(item.accessTokenExpiresAt))
          && Date.parse(item.accessTokenExpiresAt) > now
        ));
        if (!tokenPair) {
          return undefined;
        }
        const session = clone(store.read().serviceAdminSessions.find((item) => item.id === tokenPair.sessionId));
        if (!session || !isTenantOperatorSession(session)) {
          return undefined;
        }
        const user = clone((store.read().tenantUsers ?? []).find((item) => item.id === session.adminId));
        if (!user || user.status !== "active") {
          return undefined;
        }
        return {
          permissions: [...session.allowedActions],
          session: toTenantOperatorSession(session),
          user
        };
      })() : undefined;
      const sessionId = input.sessionId ?? sessionFromToken?.session.id;
      if (!sessionId) {
        return false;
      }

      let revokedSession: StoredServiceAdminSession | undefined;
      store.update((state) => ({
        ...state,
        serviceAdminSessions: state.serviceAdminSessions.map((session) => {
          if (session.id !== sessionId) {
            return session;
          }
          revokedSession = { ...session, revokedAt: new Date().toISOString() };
          return revokedSession;
        })
      }));
      if (token) {
        const tokenHash = hashServiceAdminToken(token);
        store.update((state) => ({
          ...state,
          serviceAdminTokenPairs: (state.serviceAdminTokenPairs ?? []).map((pair) => (
            pair.accessTokenHash === tokenHash || pair.refreshTokenHash === tokenHash
              ? { ...pair, revokedAt: new Date().toISOString() }
              : pair
          ))
        }));
      }

      return Boolean(revokedSession);
    },

    rotateServiceAdminRefreshToken(input: RotateServiceAdminRefreshTokenInput): IdentityServiceAdminTokenRotationResult | undefined {
      if (input.nextAccessTokenHash === input.nextRefreshTokenHash) {
        return undefined;
      }

      const previousRotation = (store.read().serviceAdminTokenRotations ?? []).find((item) => item.status === "rotated" && item.next.refreshTokenHash === input.nextRefreshTokenHash);
      const idempotentRotation = (store.read().serviceAdminTokenRotations ?? []).find((item) => item.next.id === input.idempotencyKey);
      if (idempotentRotation) {
        return clone({ ...idempotentRotation, status: "duplicate" });
      }
      if (previousRotation) {
        return clone({ ...previousRotation, status: "duplicate" });
      }

      let result: IdentityServiceAdminTokenRotationResult | undefined;
      store.update((state) => {
        const tokenPairs = state.serviceAdminTokenPairs ?? [];
        const existing = tokenPairs.find((item) => (
          item.refreshTokenHash === input.refreshTokenHash
          && !item.revokedAt
          && !item.rotatedAt
          && Number.isFinite(Date.parse(item.refreshTokenExpiresAt))
          && Date.parse(item.refreshTokenExpiresAt) > Date.parse(input.rotatedAt)
        ));
        if (!existing) {
          return state;
        }
        if (hasActiveServiceAdminTokenHashConflict(tokenPairs, {
          accessTokenHash: input.nextAccessTokenHash,
          refreshTokenHash: input.nextRefreshTokenHash
        }, "")) {
          return state;
        }

        const previous: IdentityServiceAdminTokenPair = {
          ...existing,
          rotatedAt: input.rotatedAt
        };
        const next: IdentityServiceAdminTokenPair = {
          accessTokenExpiresAt: input.nextAccessTokenExpiresAt,
          accessTokenHash: input.nextAccessTokenHash,
          id: input.idempotencyKey,
          issuedAt: input.rotatedAt,
          refreshTokenExpiresAt: input.nextRefreshTokenExpiresAt,
          refreshTokenHash: input.nextRefreshTokenHash,
          revokedAt: null,
          rotatedAt: null,
          sessionId: existing.sessionId,
          subjectId: existing.subjectId
        };
        result = { next, previous, status: "rotated" };

        return {
          ...state,
          serviceAdminTokenPairs: [next, ...tokenPairs.map((item) => item.id === existing.id ? previous : item)],
          serviceAdminTokenRotations: [result, ...(state.serviceAdminTokenRotations ?? [])]
        };
      });

      return clone(result);
    },

    revokeServiceAdminToken(input: RevokeServiceAdminTokenInput): IdentityServiceAdminTokenRevokeResult | undefined {
      const revocations = store.read().serviceAdminTokenRevocations ?? [];
      const revocationByKey = revocations.find((item) => item.idempotencyKey === input.idempotencyKey);
      if (revocationByKey) {
        const tokenMatches = revocationByKey.token.accessTokenHash === input.tokenHash || revocationByKey.token.refreshTokenHash === input.tokenHash;
        return tokenMatches ? clone({ ...revocationByKey, status: "duplicate" }) : undefined;
      }

      const idempotentRevocation = revocations.find((item) => item.token.accessTokenHash === input.tokenHash || item.token.refreshTokenHash === input.tokenHash);
      if (idempotentRevocation) {
        return clone({ ...idempotentRevocation, status: "duplicate" });
      }

      let result: IdentityServiceAdminTokenRevokeResult | undefined;
      store.update((state) => {
        const tokenPairs = state.serviceAdminTokenPairs ?? [];
        const existing = tokenPairs.find((item) => (
          (item.accessTokenHash === input.tokenHash || item.refreshTokenHash === input.tokenHash)
          && !item.revokedAt
        ));
        if (!existing) {
          return state;
        }

        const token = { ...existing, revokedAt: input.revokedAt };
        result = { idempotencyKey: input.idempotencyKey, status: "revoked", token };

        return {
          ...state,
          serviceAdminTokenPairs: tokenPairs.map((item) => item.id === existing.id ? token : item),
          serviceAdminTokenRevocations: [result, ...(state.serviceAdminTokenRevocations ?? [])]
        };
      });

      return clone(result);
    },

    appendOutbox(event: OutboxEvent): OutboxEvent {
      store.update((state) => ({
        ...state,
        outbox: [...state.outbox, event]
      }));

      return clone(event);
    }
  };
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_LENGTH = 16;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export const PASSWORD_CREDENTIAL_ALGORITHM = "scrypt" as const;

export function hashPasswordCredential(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    maxmem: SCRYPT_MAX_MEMORY,
    p: SCRYPT_PARALLELIZATION,
    r: SCRYPT_BLOCK_SIZE
  });
  return `scrypt:${SCRYPT_COST}:${SCRYPT_BLOCK_SIZE}:${SCRYPT_PARALLELIZATION}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export function isLegacyPasswordCredential(credential: IdentityPasswordCredential | undefined): boolean {
  if (!credential) {
    return false;
  }
  return credential.algorithm === "sha256" || String(credential.hash ?? "").startsWith("sha256:");
}

function verifyScryptPasswordHash(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const saltHex = parts[4];
  const keyHex = parts[5];
  if (
    !Number.isInteger(cost) || cost < 2
    || !Number.isInteger(blockSize) || blockSize < 1
    || !Number.isInteger(parallelization) || parallelization < 1
    || !saltHex || !keyHex || keyHex.length % 2 !== 0
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(keyHex, "hex");
    if (expected.length === 0) {
      return false;
    }
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: cost,
      maxmem: SCRYPT_MAX_MEMORY,
      p: parallelization,
      r: blockSize
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashServiceAdminToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

export function hashAuthFlowToken(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

type MfaChallengeDenial = Extract<MfaChallengeConsumeResult, { valid: false }>;

function resolveMfaChallengeDenial(
  challenge: {
    attempts?: number;
    consumedAt: Date | string | null;
    email: string;
    expiresAt: Date | string;
    maxAttempts?: number;
  } | null | undefined,
  email: string,
  now: Date
): MfaChallengeDenial | null {
  if (!challenge) {
    return {
      code: "mfa_challenge_not_found",
      message: "MFA challenge was not found.",
      valid: false
    };
  }
  if (challenge.consumedAt) {
    return {
      code: "mfa_challenge_consumed",
      message: "MFA challenge was already consumed.",
      valid: false
    };
  }
  if (normalizeEmail(challenge.email) !== normalizeEmail(email)) {
    return {
      code: "mfa_challenge_mismatch",
      message: "MFA challenge does not belong to this login.",
      valid: false
    };
  }
  if (!Number.isFinite(Date.parse(toIso(challenge.expiresAt))) || Date.parse(toIso(challenge.expiresAt)) <= now.getTime()) {
    return {
      code: "mfa_challenge_expired",
      message: "MFA challenge has expired.",
      valid: false
    };
  }
  if ((challenge.attempts ?? 0) >= (challenge.maxAttempts ?? 5)) {
    return {
      code: "mfa_challenge_attempts_exceeded",
      message: "MFA challenge has exceeded the allowed verification attempts.",
      valid: false
    };
  }
  return null;
}

function secureStringEqual(expectedValue: string, actualValue: string): boolean {
  const expected = Buffer.from(String(expectedValue ?? ""));
  const actual = Buffer.from(String(actualValue ?? ""));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isTenantOperatorSession(session: StoredServiceAdminSession): boolean {
  return session.id.startsWith("top-session_");
}

function toTenantOperatorSession(session: StoredServiceAdminSession): StoredTenantOperatorSession {
  return {
    allowedActions: [...session.allowedActions],
    expiresAt: session.expiresAt,
    id: session.id,
    revokedAt: session.revokedAt ?? null,
    role: session.role,
    tenantId: session.currentTenantId,
    userEmail: session.adminEmail,
    userId: session.adminId,
    userName: session.adminName
  };
}

function hasActiveServiceAdminTokenHashConflict(
  tokenPairs: IdentityServiceAdminTokenPair[],
  hashes: { accessTokenHash: string; refreshTokenHash: string },
  ignoredPairId: string
): boolean {
  if (hashes.accessTokenHash === hashes.refreshTokenHash) {
    return true;
  }

  return tokenPairs.some((item) => (
    item.id !== ignoredPairId
    && (
      item.accessTokenHash === hashes.accessTokenHash
      || item.accessTokenHash === hashes.refreshTokenHash
      || item.refreshTokenHash === hashes.accessTokenHash
      || item.refreshTokenHash === hashes.refreshTokenHash
    )
  ));
}

export function verifyPasswordCredential(password: string, credential: IdentityPasswordCredential | undefined): boolean {
  if (!credential || (credential.algorithm !== "sha256" && credential.algorithm !== "scrypt")) {
    return false;
  }

  const storedHash = String(credential.hash ?? "");
  if (storedHash.startsWith("scrypt:")) {
    return verifyScryptPasswordHash(password, storedHash);
  }

  const expected = Buffer.from(storedHash);
  const actual = Buffer.from(`sha256:${createHash("sha256").update(password).digest("hex")}`);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveServiceAdminSessionInput(input: CreateServiceAdminSessionInput): {
  actorId: string;
  actorName: string;
  adminEmail: string;
  allowedActions: string[];
  availableOrganizations: IdentityAvailableOrganization[];
  currentTenantId: string;
  role: string;
  tenantScope: string;
} {
  const actorId = String(input.actorId ?? "").trim();
  if (!actorId) {
    throw new Error("Service-admin session requires an authenticated actor id.");
  }
  const adminEmail = normalizeEmail(input.adminEmail ?? actorId);

  return {
    actorId,
    actorName: String(input.actorName ?? adminEmail).trim() || adminEmail,
    adminEmail,
    allowedActions: clone(input.allowedActions ?? serviceAdminPrivilegedActions),
    availableOrganizations: clone(input.availableOrganizations ?? []),
    currentTenantId: String(input.currentTenantId ?? "").trim(),
    role: String(input.role ?? "service_admin").trim() || "service_admin",
    tenantScope: String(input.tenantScope ?? "platform").trim() || "platform"
  };
}

function toIdentityTenant(row: PrismaTenantRow): IdentityTenant {
  const metadata = toJsonRecord(row.metadata);
  const healthScore = row.healthScore ?? numberFromMetadata(metadata.healthScore, 0);

  return {
    activeUsers: numberFromMetadata(metadata.activeUsers, 0),
    arr: numberFromMetadata(metadata.arr, 0),
    domains: arrayFromMetadata(metadata.domains),
    employeeGroups: Array.isArray(metadata.employeeGroups)
      ? clone(metadata.employeeGroups) as IdentityTenant["employeeGroups"]
      : undefined,
    flags: arrayFromMetadata(metadata.flags),
    healthScore,
    id: row.id,
    incidentIds: arrayFromMetadata(metadata.incidentIds),
    lastSeenAt: stringFromMetadata(metadata.lastSeenAt, ""),
    legalName: stringFromMetadata(metadata.legalName, row.name),
    monthlyRevenue: numberFromMetadata(metadata.monthlyRevenue, 0),
    name: row.name,
    notes: stringFromMetadata(metadata.notes, ""),
    owner: stringFromMetadata(metadata.owner, ""),
    ownerEmail: stringFromMetadata(metadata.ownerEmail, ""),
    planId: stringFromMetadata(metadata.planId, "unknown"),
    region: stringFromMetadata(metadata.region, "unknown"),
    sla: numberFromMetadata(metadata.sla, 0),
    status: tenantStatusFromRow(row.status),
    users: numberFromMetadata(metadata.users, 0),
    workspaces: numberFromMetadata(metadata.workspaces, 0)
  };
}

function ensureSeedPasswordCredentials(store: DurableStore<IdentityState>): void {
  const seedCredentials = seedIdentityPasswordCredentials();
  const existingEmails = new Set(
    (store.read().passwordCredentials ?? []).map((credential) => normalizeEmail(credential.email))
  );
  const missingCredentials = seedCredentials.filter((credential) => !existingEmails.has(normalizeEmail(credential.email)));

  if (missingCredentials.length === 0) {
    return;
  }

  store.update((state) => ({
    ...state,
    passwordCredentials: [
      ...(state.passwordCredentials ?? []),
      ...missingCredentials
    ]
  }));
}

function ensureSeedServiceAdminOperationsAccess(store: DurableStore<IdentityState>): void {
  const serviceAdminRole = identityPermissionRoleCatalog.find((role) => role.key === "service_admin");
  const requiredActions = Array.from(new Set([...serviceAdminPrivilegedActions, ...(serviceAdminRole?.actions ?? [])]));

  store.update((state) => {
    let changed = false;
    const activePolicy = (state.rbacPolicyVersions ?? [])
      .filter((policy) => policy.status === "active")
      .sort(compareRbacPolicyVersionsForActiveSelection)[0] ?? defaultRbacPolicyVersion();
    const rbacPolicyVersions = state.rbacPolicyVersions?.some((policy) => policy.id === activePolicy.id)
      ? state.rbacPolicyVersions
      : [activePolicy, ...(state.rbacPolicyVersions ?? [])];
    if (rbacPolicyVersions !== state.rbacPolicyVersions) {
      changed = true;
    }

    const persistedRoles = state.permissionRoles?.length ? state.permissionRoles : identityPermissionRoleCatalog;
    const nextPermissionRoles = persistedRoles.map((role) => {
      if (role.key !== "service_admin") {
        return role;
      }

      const actions = mergeActions(role.actions, requiredActions);
      if (actions.length === role.actions.length) {
        return role;
      }

      changed = true;
      return { ...role, actions };
    });

    const privilegedServiceAdminActions = mergeActions(
      state.privilegedServiceAdminActions ?? [],
      serviceAdminPrivilegedActions
    );
    if (privilegedServiceAdminActions.length !== (state.privilegedServiceAdminActions ?? []).length) {
      changed = true;
    }

    const serviceAdminSessions = (state.serviceAdminSessions ?? []).map((session) => {
      if (!isSeedServiceAdminSession(session)) {
        return session;
      }

      const allowedActions = mergeActions(session.allowedActions, serviceAdminPrivilegedActions);
      if (allowedActions.length === session.allowedActions.length) {
        return session;
      }

      changed = true;
      return { ...session, allowedActions };
    });

    const rbacRoleGrants = [...(state.rbacRoleGrants ?? [])];
    const grantIds = new Set(rbacRoleGrants.map((grant) => grant.id));
    for (const action of requiredActions) {
      const alreadyGranted = rbacRoleGrants.some((grant) => (
        grant.action === action
        && grant.effect === "allow"
        && grant.policyVersionId === activePolicy.id
        && grant.resource === "*"
        && grant.roleKey === "service_admin"
        && grant.tenantId === null
      ));
      if (alreadyGranted) {
        continue;
      }

      changed = true;
      let id = `rbac-grant-backfill-service_admin-${sanitizeGrantIdPart(action)}`;
      let suffix = 1;
      while (grantIds.has(id)) {
        suffix += 1;
        id = `rbac-grant-backfill-service_admin-${sanitizeGrantIdPart(action)}-${suffix}`;
      }
      grantIds.add(id);
      rbacRoleGrants.push({
        action,
        createdAt: "2026-07-05T00:00:00.000Z",
        createdBy: "system",
        effect: "allow",
        id,
        policyVersionId: activePolicy.id,
        resource: "*",
        roleKey: "service_admin",
        tenantId: null,
        traceId: "trc_rbac_seed_backfill"
      });
    }

    return changed
      ? {
          ...state,
          permissionRoles: nextPermissionRoles,
          privilegedServiceAdminActions,
          rbacPolicyVersions,
          rbacRoleGrants,
          serviceAdminSessions
        }
      : state;
  });
}

function isSeedServiceAdminSession(session: StoredServiceAdminSession): boolean {
  if (session.role !== "service_admin" || isTenantOperatorSession(session)) {
    return false;
  }

  const allowedActions = new Set(session.allowedActions);
  return [
    "auth.state",
    "service-admin.users.read",
    "service-admin.users.write",
    "platform.read"
  ].every((action) => allowedActions.has(action));
}

function mergeActions(existing: string[], required: string[]): string[] {
  const merged = [...existing];
  const seen = new Set(existing);
  for (const action of required) {
    if (!seen.has(action)) {
      seen.add(action);
      merged.push(action);
    }
  }
  return merged;
}

function sanitizeGrantIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "action";
}

function toPrismaTenantCreateInput(tenant: IdentityTenant): PrismaTenantCreateInput {
  return {
    healthScore: tenant.healthScore,
    id: tenant.id,
    metadata: {
      activeUsers: tenant.activeUsers,
      arr: tenant.arr,
      domains: tenant.domains,
      employeeGroups: tenant.employeeGroups ?? [],
      flags: tenant.flags,
      incidentIds: tenant.incidentIds,
      lastSeenAt: tenant.lastSeenAt,
      legalName: tenant.legalName,
      monthlyRevenue: tenant.monthlyRevenue,
      notes: tenant.notes,
      owner: tenant.owner,
      ownerEmail: tenant.ownerEmail,
      planId: tenant.planId,
      region: tenant.region,
      sla: tenant.sla,
      users: tenant.users,
      workspaces: tenant.workspaces
    },
    name: tenant.name,
    status: tenant.status
  };
}

function toTenantAuditEvent(row: PrismaTenantAuditEventRow): IdentityTenantAuditEvent {
  return {
    action: row.action,
    actor: row.actor,
    at: toIso(row.at),
    id: row.id,
    immutable: row.immutable ?? true,
    reason: row.reason ?? "",
    result: row.result,
    severity: row.severity,
    target: row.target,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function toTenantUser(row: PrismaTenantUserRow): IdentityTenantUser {
  return {
    device: row.device,
    email: row.email,
    id: row.id,
    inviteStatus: row.inviteStatus,
    lastActiveAt: row.lastActiveAt ? toIso(row.lastActiveAt) : null,
    mfa: row.mfa,
    metadata: toJsonRecord(row.metadata),
    name: row.name,
    risk: row.risk,
    role: row.role,
    sessions: Number.isFinite(row.sessions) ? row.sessions : 0,
    status: row.status,
    supportNotes: row.supportNotes,
    tenantId: row.tenantId
  };
}

function toPermissionRole(row: PrismaPermissionRoleRow): IdentityPermissionRole {
  return {
    actions: arrayFromMetadata(row.actions),
    aliases: arrayFromMetadata(row.aliases),
    description: row.description ?? "",
    groupIds: arrayFromMetadata(row.groupIds),
    key: row.key,
    metadata: toJsonRecord(row.metadata)
  };
}

function toRbacPolicyVersion(row: PrismaRbacPolicyVersionRow): IdentityRbacPolicyVersion {
  return {
    activatedAt: row.activatedAt ? toIso(row.activatedAt) : null,
    checksum: row.checksum,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
    description: row.description,
    id: row.id,
    status: rbacPolicyStatusFromRow(row.status),
    version: row.version
  };
}

function toRbacRoleGrant(row: PrismaRbacRoleGrantRow): IdentityRbacRoleGrant | undefined {
  const effect = rbacGrantEffectFromRow(row.effect);
  if (!effect) {
    return undefined;
  }

  return {
    action: row.action,
    createdAt: toIso(row.createdAt),
    createdBy: row.createdBy,
    effect,
    id: row.id,
    policyVersionId: row.policyVersionId,
    resource: row.resource,
    roleKey: row.roleKey,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function toPermissionDenialEvent(row: PrismaPermissionDenialEventRow): IdentityPermissionDenialEvent {
  return {
    action: row.action,
    actorId: row.actorId,
    at: toIso(row.at),
    id: row.id,
    immutable: true,
    policyVersionId: row.policyVersionId,
    reason: row.reason,
    resource: row.resource,
    roleKey: row.roleKey,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function toMfaChallenge(row: PrismaMfaChallengeRow): IdentityMfaChallenge {
  return {
    attempts: row.attempts,
    consumedAt: row.consumedAt ? toIso(row.consumedAt) : null,
    createdAt: toIso(row.createdAt),
    email: row.email,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    maxAttempts: row.maxAttempts,
    otpHash: row.otpHash
  };
}

function toInviteTokenDescriptor(row: PrismaAuthInviteTokenRow, code: string): IdentityAuthInviteToken {
  return {
    code,
    consumedAt: row.consumedAt ? toIso(row.consumedAt) : null,
    createdAt: toIso(row.createdAt),
    email: normalizeEmail(row.email),
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    tenantId: row.tenantId
  };
}

function toRecoveryTokenDescriptor(row: PrismaAuthRecoveryTokenRow, token: string): IdentityAuthRecoveryToken {
  return {
    consumedAt: row.consumedAt ? toIso(row.consumedAt) : null,
    createdAt: toIso(row.createdAt),
    email: normalizeEmail(row.email),
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    token
  };
}

function toPrismaAuthInviteTokenInput(token: IdentityAuthInviteTokenRecord): PrismaAuthInviteTokenCreateInput {
  return {
    codeHash: token.codeHash,
    consumedAt: token.consumedAt ? new Date(token.consumedAt) : null,
    createdAt: new Date(token.createdAt),
    email: normalizeEmail(token.email),
    expiresAt: new Date(token.expiresAt),
    id: token.id,
    tenantId: token.tenantId
  };
}

function toPrismaAuthRecoveryTokenInput(token: IdentityAuthRecoveryTokenRecord): PrismaAuthRecoveryTokenCreateInput {
  return {
    consumedAt: token.consumedAt ? new Date(token.consumedAt) : null,
    createdAt: new Date(token.createdAt),
    email: normalizeEmail(token.email),
    expiresAt: new Date(token.expiresAt),
    id: token.id,
    tokenHash: token.tokenHash
  };
}

function toPasswordCredential(row: PrismaPasswordCredentialRow): IdentityPasswordCredential | undefined {
  if (row.algorithm !== "sha256" && row.algorithm !== "scrypt") {
    return undefined;
  }

  return {
    algorithm: row.algorithm,
    email: normalizeEmail(row.email),
    hash: row.hash,
    subjectId: row.subjectId,
    updatedAt: toIso(row.updatedAt),
    version: row.version
  };
}

function toPasswordPolicy(row: PrismaPasswordPolicyRow): IdentityPasswordPolicy {
  return {
    maxFailedAttempts: row.maxFailedAttempts,
    minLength: row.minLength,
    requireMfa: row.requireMfa,
    scope: row.scope,
    updatedAt: toIso(row.updatedAt)
  };
}

function toCredentialAuditEvent(row: PrismaCredentialAuditEventRow): IdentityCredentialAuditEvent {
  return {
    action: row.action,
    actor: row.actor,
    at: toIso(row.at),
    id: row.id,
    immutable: true,
    reason: row.reason,
    result: row.result,
    subjectId: row.subjectId,
    traceId: row.traceId
  };
}

function toOidcProviderConfig(row: PrismaOidcProviderConfigRow): IdentityOidcProviderConfig {
  return {
    audience: row.audience,
    clientId: row.clientId,
    enabled: row.enabled,
    issuer: row.issuer,
    jwksUri: row.jwksUri,
    providerId: row.providerId,
    scopes: [...row.scopes],
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt)
  };
}

function toOidcCallbackDescriptor(row: PrismaOidcCallbackDescriptorRow): IdentityOidcCallbackDescriptor {
  return {
    consumedAt: row.consumedAt ? toIso(row.consumedAt) : null,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    nonceHash: row.nonceHash,
    providerId: row.providerId,
    redirectUri: row.redirectUri,
    requestedAt: toIso(row.requestedAt),
    state: row.state,
    traceId: row.traceId
  };
}

function toSamlProviderMetadata(row: PrismaSamlProviderMetadataRow): IdentitySamlProviderMetadata {
  return {
    acsUrl: row.acsUrl,
    audience: row.audience,
    certificateFingerprint: row.certificateFingerprint,
    enabled: row.enabled,
    entityId: row.entityId,
    providerId: row.providerId,
    ssoUrl: row.ssoUrl,
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt)
  };
}

function toSamlAcsRequestDescriptor(row: PrismaSamlAcsRequestDescriptorRow): IdentitySamlAcsRequestDescriptor {
  return {
    acsUrl: row.acsUrl,
    consumedAt: row.consumedAt ? toIso(row.consumedAt) : null,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    providerId: row.providerId,
    relayState: row.relayState,
    requestedAt: toIso(row.requestedAt),
    requestId: row.requestId,
    traceId: row.traceId
  };
}

function toSamlAssertionReplay(row: PrismaSamlAssertionReplayRow): IdentitySamlAssertionReplay {
  return {
    assertionId: row.assertionId,
    audience: row.audience,
    expiresAt: toIso(row.expiresAt),
    providerId: row.providerId,
    receivedAt: toIso(row.receivedAt),
    requestId: row.requestId,
    subjectId: row.subjectId,
    traceId: row.traceId
  };
}

function toServiceAdminSession(row: PrismaServiceAdminSessionRow): StoredServiceAdminSession {
  return {
    actorId: row.actorId,
    actorName: row.actorName,
    adminEmail: row.adminEmail,
    adminId: row.adminId,
    adminName: row.adminName,
    allowedActions: [...row.allowedActions],
    authState: row.authState,
    availableOrganizations: clone(row.availableOrganizations) as IdentityAvailableOrganization[],
    currentTenantId: row.currentTenantId,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    mfaVerifiedAt: row.mfaVerifiedAt ? toIso(row.mfaVerifiedAt) : null,
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    role: row.role,
    tenantScope: row.tenantScope
  };
}

function toServiceAdminTokenPair(row: PrismaServiceAdminTokenPairRow): IdentityServiceAdminTokenPair {
  return {
    accessTokenExpiresAt: toIso(row.accessTokenExpiresAt),
    accessTokenHash: row.accessTokenHash,
    id: row.id,
    issuedAt: toIso(row.issuedAt),
    refreshTokenExpiresAt: toIso(row.refreshTokenExpiresAt),
    refreshTokenHash: row.refreshTokenHash,
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    rotatedAt: row.rotatedAt ? toIso(row.rotatedAt) : null,
    sessionId: row.sessionId,
    subjectId: row.subjectId
  };
}

function toServiceAdminAuditEvent(row: PrismaServiceAdminAuditEventRow): IdentityServiceAdminAuditEvent {
  return {
    action: row.action,
    actor: row.actor,
    actorName: row.actorName,
    at: toIso(row.at),
    id: row.id,
    immutable: true,
    reason: row.reason,
    result: row.result,
    severity: serviceAdminAuditSeverityFromRow(row.severity),
    target: row.target,
    tenantId: row.tenantId,
    traceId: row.traceId,
    userId: row.userId
  };
}

function toServiceAdminAuditExport(row: PrismaServiceAdminAuditExportRow): IdentityServiceAdminAuditExport {
  return {
    createdAt: toIso(row.createdAt),
    descriptor: clone(row.descriptor) as Record<string, unknown>,
    descriptorId: row.descriptorId,
    expiresAt: toIso(row.expiresAt),
    filters: clone(row.filters) as Record<string, string>,
    id: row.id,
    objectKey: row.objectKey,
    redactionPolicy: row.redactionPolicy,
    requesterId: row.requesterId,
    requesterName: row.requesterName,
    sourceEventIds: Array.isArray(row.sourceEventIds) ? [...row.sourceEventIds as string[]] : []
  };
}

function toServiceAdminAuditRedaction(row: PrismaServiceAdminAuditRedactionRow): IdentityServiceAdminAuditRedaction {
  return {
    actor: row.actor,
    actorName: row.actorName,
    at: toIso(row.at),
    createdAt: toIso(row.createdAt),
    eventId: row.eventId,
    id: row.id,
    overlay: clone(row.overlay) as Record<string, unknown>,
    reason: row.reason
  };
}

function toServiceAdminImpersonation(row: PrismaServiceAdminImpersonationRow): IdentityServiceAdminImpersonationSession {
  return {
    auditEventId: row.auditEventId ?? null,
    approvalId: row.approvalId ?? null,
    banner: row.banner,
    durationMinutes: row.durationMinutes,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    mode: serviceAdminImpersonationModeFromRow(row.mode),
    startedAt: toIso(row.startedAt),
    stoppedAt: row.stoppedAt ? toIso(row.stoppedAt) : null,
    stopAuditEvent: serviceAdminAuditEventFromJson(row.stopAuditEvent),
    tenantId: row.tenantId,
    tenantName: row.tenantName,
    userId: row.userId,
    userName: row.userName
  };
}

function toBreakGlassApproval(row: PrismaBreakGlassApprovalRow): IdentityBreakGlassApproval {
  return {
    action: row.action,
    auditEventId: row.auditEventId,
    durationMinutes: row.durationMinutes,
    expiresAt: toIso(row.expiresAt),
    id: row.id,
    requestedAt: toIso(row.requestedAt),
    status: breakGlassApprovalStatusFromRow(row.status),
    target: row.target,
    tenantId: row.tenantId,
    userId: row.userId
  };
}

function toPrismaTenantAuditEventCreateInput(event: IdentityTenantAuditEvent): PrismaTenantAuditEventCreateInput {
  return {
    action: event.action,
    actor: event.actor,
    at: new Date(event.at),
    id: event.id,
    immutable: event.immutable ?? true,
    reason: event.reason,
    result: event.result,
    severity: event.severity,
    target: event.target,
    tenantId: event.tenantId,
    traceId: event.traceId
  };
}

function toPrismaServiceAdminAuditEventCreateInput(event: IdentityServiceAdminAuditEvent): PrismaServiceAdminAuditEventCreateInput {
  return {
    action: event.action,
    actor: event.actor,
    actorName: event.actorName,
    at: new Date(event.at),
    id: event.id,
    immutable: event.immutable,
    reason: event.reason,
    result: event.result,
    severity: event.severity,
    target: event.target,
    tenantId: event.tenantId,
    traceId: event.traceId,
    userId: event.userId
  };
}

function toPrismaServiceAdminAuditExportCreateInput(exportRecord: IdentityServiceAdminAuditExport): PrismaServiceAdminAuditExportCreateInput {
  return {
    createdAt: new Date(exportRecord.createdAt),
    descriptor: clone(exportRecord.descriptor),
    descriptorId: exportRecord.descriptorId,
    expiresAt: new Date(exportRecord.expiresAt),
    filters: clone(exportRecord.filters),
    id: exportRecord.id,
    objectKey: exportRecord.objectKey,
    redactionPolicy: exportRecord.redactionPolicy,
    requesterId: exportRecord.requesterId,
    requesterName: exportRecord.requesterName,
    sourceEventIds: [...exportRecord.sourceEventIds]
  };
}

function toPrismaServiceAdminAuditRedactionCreateInput(redaction: IdentityServiceAdminAuditRedaction): PrismaServiceAdminAuditRedactionCreateInput {
  return {
    actor: redaction.actor,
    actorName: redaction.actorName,
    at: new Date(redaction.at),
    createdAt: new Date(redaction.createdAt),
    eventId: redaction.eventId,
    id: redaction.id,
    overlay: clone(redaction.overlay),
    reason: redaction.reason
  };
}

function toPrismaPasswordCredentialInput(credential: IdentityPasswordCredential): PrismaPasswordCredentialCreateInput {
  return {
    algorithm: credential.algorithm,
    email: normalizeEmail(credential.email),
    hash: credential.hash,
    subjectId: credential.subjectId,
    updatedAt: new Date(credential.updatedAt),
    version: credential.version
  };
}

function toPrismaPasswordPolicyInput(policy: IdentityPasswordPolicy): PrismaPasswordPolicyCreateInput {
  return {
    maxFailedAttempts: policy.maxFailedAttempts,
    minLength: policy.minLength,
    requireMfa: policy.requireMfa,
    scope: policy.scope,
    updatedAt: new Date(policy.updatedAt)
  };
}

function toPrismaCredentialAuditEventCreateInput(event: IdentityCredentialAuditEvent): PrismaCredentialAuditEventCreateInput {
  return {
    action: event.action,
    actor: event.actor,
    at: new Date(event.at),
    id: event.id,
    immutable: event.immutable,
    reason: event.reason,
    result: event.result,
    subjectId: event.subjectId,
    traceId: event.traceId
  };
}

function toPrismaRbacPolicyVersionCreateInput(policyVersion: IdentityRbacPolicyVersion): PrismaRbacPolicyVersionCreateInput {
  return {
    activatedAt: policyVersion.activatedAt ? new Date(policyVersion.activatedAt) : null,
    checksum: policyVersion.checksum,
    createdAt: new Date(policyVersion.createdAt),
    createdBy: policyVersion.createdBy,
    description: policyVersion.description,
    id: policyVersion.id,
    status: policyVersion.status,
    version: policyVersion.version
  };
}

function toPrismaRbacRoleGrantCreateInput(grant: IdentityRbacRoleGrant): PrismaRbacRoleGrantCreateInput {
  return {
    action: grant.action,
    createdAt: new Date(grant.createdAt),
    createdBy: grant.createdBy,
    effect: grant.effect,
    id: grant.id,
    policyVersionId: grant.policyVersionId,
    resource: grant.resource,
    roleKey: grant.roleKey,
    tenantId: grant.tenantId,
    traceId: grant.traceId
  };
}

function toPrismaPermissionDenialEventCreateInput(event: IdentityPermissionDenialEvent): PrismaPermissionDenialEventCreateInput {
  return {
    action: event.action,
    actorId: event.actorId,
    at: new Date(event.at),
    id: event.id,
    immutable: event.immutable,
    policyVersionId: event.policyVersionId,
    reason: event.reason,
    resource: event.resource,
    roleKey: event.roleKey,
    tenantId: event.tenantId,
    traceId: event.traceId
  };
}

function toPrismaOidcProviderConfigInput(config: IdentityOidcProviderConfig): PrismaOidcProviderConfigCreateInput {
  return {
    audience: config.audience,
    clientId: config.clientId,
    enabled: config.enabled,
    issuer: config.issuer,
    jwksUri: config.jwksUri,
    providerId: config.providerId,
    scopes: [...config.scopes],
    tenantId: config.tenantId,
    updatedAt: new Date(config.updatedAt)
  };
}

function toPrismaOidcCallbackDescriptorCreateInput(descriptor: IdentityOidcCallbackDescriptor): PrismaOidcCallbackDescriptorCreateInput {
  return {
    consumedAt: descriptor.consumedAt ? new Date(descriptor.consumedAt) : null,
    expiresAt: new Date(descriptor.expiresAt),
    id: descriptor.id,
    nonceHash: descriptor.nonceHash,
    providerId: descriptor.providerId,
    redirectUri: descriptor.redirectUri,
    requestedAt: new Date(descriptor.requestedAt),
    state: descriptor.state,
    traceId: descriptor.traceId
  };
}

function toPrismaSamlProviderMetadataInput(metadata: IdentitySamlProviderMetadata): PrismaSamlProviderMetadataCreateInput {
  return {
    acsUrl: metadata.acsUrl,
    audience: metadata.audience,
    certificateFingerprint: metadata.certificateFingerprint,
    enabled: metadata.enabled,
    entityId: metadata.entityId,
    providerId: metadata.providerId,
    ssoUrl: metadata.ssoUrl,
    tenantId: metadata.tenantId,
    updatedAt: new Date(metadata.updatedAt)
  };
}

function toPrismaSamlAcsRequestDescriptorCreateInput(descriptor: IdentitySamlAcsRequestDescriptor): PrismaSamlAcsRequestDescriptorCreateInput {
  return {
    acsUrl: descriptor.acsUrl,
    consumedAt: descriptor.consumedAt ? new Date(descriptor.consumedAt) : null,
    expiresAt: new Date(descriptor.expiresAt),
    id: descriptor.id,
    providerId: descriptor.providerId,
    relayState: descriptor.relayState,
    requestedAt: new Date(descriptor.requestedAt),
    requestId: descriptor.requestId,
    traceId: descriptor.traceId
  };
}

function toPrismaSamlAssertionReplayCreateInput(replay: IdentitySamlAssertionReplay): PrismaSamlAssertionReplayCreateInput {
  return {
    assertionId: replay.assertionId,
    audience: replay.audience,
    expiresAt: new Date(replay.expiresAt),
    providerId: replay.providerId,
    receivedAt: new Date(replay.receivedAt),
    requestId: replay.requestId,
    subjectId: replay.subjectId,
    traceId: replay.traceId
  };
}

function toPrismaServiceAdminTokenPairCreateInput(input: CreateServiceAdminTokenPairInput): PrismaServiceAdminTokenPairCreateInput {
  return {
    accessTokenExpiresAt: new Date(input.accessTokenExpiresAt),
    accessTokenHash: input.accessTokenHash,
    id: input.id,
    issuedAt: new Date(input.issuedAt),
    refreshTokenExpiresAt: new Date(input.refreshTokenExpiresAt),
    refreshTokenHash: input.refreshTokenHash,
    revokedAt: null,
    rotatedAt: null,
    sessionId: input.sessionId,
    subjectId: input.subjectId
  };
}

function toPrismaActiveTokenHashConflictWhere(
  hashes: { accessTokenHash: string; refreshTokenHash: string },
  ignoredPairId: string
): Record<string, unknown> {
  return {
    id: { not: ignoredPairId },
    OR: [
      { accessTokenHash: hashes.accessTokenHash },
      { accessTokenHash: hashes.refreshTokenHash },
      { refreshTokenHash: hashes.accessTokenHash },
      { refreshTokenHash: hashes.refreshTokenHash }
    ],
  };
}

function serviceAdminTokenPairMatchesInput(
  pair: IdentityServiceAdminTokenPair | PrismaServiceAdminTokenPairRow,
  input: CreateServiceAdminTokenPairInput
): boolean {
  return pair.id === input.id
    && pair.accessTokenHash === input.accessTokenHash
    && pair.refreshTokenHash === input.refreshTokenHash
    && pair.sessionId === input.sessionId
    && pair.subjectId === input.subjectId
    && toIso(pair.accessTokenExpiresAt) === toIso(input.accessTokenExpiresAt)
    && toIso(pair.refreshTokenExpiresAt) === toIso(input.refreshTokenExpiresAt)
    && toIso(pair.issuedAt) === toIso(input.issuedAt);
}

function toPrismaServiceAdminImpersonationCreateInput(session: IdentityServiceAdminImpersonationSession): PrismaServiceAdminImpersonationCreateInput {
  return {
    auditEventId: session.auditEventId ?? null,
    approvalId: session.approvalId ?? null,
    banner: session.banner,
    durationMinutes: session.durationMinutes,
    expiresAt: new Date(session.expiresAt),
    id: session.id,
    mode: session.mode,
    startedAt: new Date(session.startedAt),
    stoppedAt: session.stoppedAt ? new Date(session.stoppedAt) : null,
    stopAuditEvent: session.stopAuditEvent ? serviceAdminAuditEventToJson(session.stopAuditEvent) : null,
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    userId: session.userId,
    userName: session.userName
  };
}

function toPrismaBreakGlassApprovalCreateInput(approval: IdentityBreakGlassApproval): PrismaBreakGlassApprovalCreateInput {
  return {
    action: approval.action,
    auditEventId: approval.auditEventId,
    durationMinutes: approval.durationMinutes,
    expiresAt: new Date(approval.expiresAt),
    id: approval.id,
    requestedAt: new Date(approval.requestedAt),
    status: approval.status,
    target: approval.target,
    tenantId: approval.tenantId,
    userId: approval.userId
  };
}

function toPrismaTenantUserUpdateInput(changes: Partial<IdentityTenantUser>): PrismaTenantUserUpdateInput {
  const input: PrismaTenantUserUpdateInput = {};

  if (changes.device !== undefined) input.device = changes.device;
  if (changes.email !== undefined) input.email = changes.email;
  if (changes.inviteStatus !== undefined) input.inviteStatus = changes.inviteStatus;
  if (changes.lastActiveAt !== undefined) input.lastActiveAt = changes.lastActiveAt ? new Date(changes.lastActiveAt) : null;
  if (changes.metadata !== undefined) input.metadata = changes.metadata;
  if (changes.mfa !== undefined) input.mfa = changes.mfa;
  if (changes.name !== undefined) input.name = changes.name;
  if (changes.risk !== undefined) input.risk = changes.risk;
  if (changes.role !== undefined) input.role = changes.role;
  if (changes.sessions !== undefined) input.sessions = changes.sessions;
  if (changes.status !== undefined) input.status = changes.status;
  if (changes.supportNotes !== undefined) input.supportNotes = changes.supportNotes;
  if (changes.tenantId !== undefined) input.tenantId = changes.tenantId;

  return input;
}

function toPrismaTenantUserCreateInput(user: IdentityTenantUser): PrismaTenantUserCreateInput {
  return {
    device: user.device,
    email: user.email,
    id: user.id,
    inviteStatus: user.inviteStatus,
    lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt) : null,
    metadata: user.metadata ?? {},
    mfa: user.mfa,
    name: user.name,
    risk: user.risk,
    role: user.role,
    sessions: user.sessions,
    status: user.status,
    supportNotes: user.supportNotes,
    tenantId: user.tenantId
  };
}

function toPrismaOutboxEventCreateInput(event: OutboxEvent): PrismaOutboxEventCreateInput {
  return {
    aggregateId: event.aggregateId,
    aggregateType: event.aggregateType,
    id: event.id,
    occurredAt: new Date(event.occurredAt),
    payload: event.payload,
    queue: event.queue,
    status: event.status,
    traceId: event.traceId,
    type: event.type
  };
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
}

function tenantStatusFromRow(status: string): IdentityTenant["status"] {
  return supportedTenantStatuses.has(status) ? status as IdentityTenant["status"] : "restricted";
}

function rbacPolicyStatusFromRow(status: string): IdentityRbacPolicyVersion["status"] {
  return status === "active" || status === "draft" || status === "retired" ? status : "retired";
}

function rbacGrantEffectFromRow(effect: string): IdentityRbacRoleGrant["effect"] | undefined {
  return effect === "allow" || effect === "deny" ? effect : undefined;
}

function compareRbacPolicyVersionsForActiveSelection(left: IdentityRbacPolicyVersion, right: IdentityRbacPolicyVersion): number {
  return String(right.activatedAt ?? "").localeCompare(String(left.activatedAt ?? ""))
    || String(right.createdAt).localeCompare(String(left.createdAt))
    || String(right.id).localeCompare(String(left.id));
}

function serviceAdminAuditSeverityFromRow(severity: string): IdentityServiceAdminAuditEvent["severity"] {
  return severity === "critical" || severity === "info" || severity === "warning" ? severity : "warning";
}

function breakGlassApprovalStatusFromRow(status: string): IdentityBreakGlassApproval["status"] {
  return status === "approved" || status === "rejected" || status === "expired" || status === "pending" ? status : "pending";
}

async function lockServiceAdminImpersonationScope(client: PrismaRawSqlClient, tenantId: string, userId: string | null): Promise<void> {
  if (!client.$executeRawUnsafe) {
    throw new Error("Prisma client does not support raw SQL advisory locks for service-admin impersonation.");
  }

  await client.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    tenantId,
    userId ?? "__tenant_scope__"
  );
}

function serviceAdminImpersonationModeFromRow(mode: string): IdentityServiceAdminImpersonationSession["mode"] {
  return mode === "break_glass_write" ? "break_glass_write" : "read_only_by_default";
}

function serviceAdminAuditEventToJson(event: IdentityServiceAdminAuditEvent): Record<string, unknown> {
  return { ...event };
}

function serviceAdminAuditEventFromJson(value: unknown): IdentityServiceAdminAuditEvent | null {
  const record = toJsonRecord(value);
  if (typeof record.id !== "string") {
    return null;
  }

  return {
    action: stringFromMetadata(record.action, ""),
    actor: stringFromMetadata(record.actor, "service-admin"),
    actorName: stringFromMetadata(record.actorName, "Service Admin"),
    at: stringFromMetadata(record.at, new Date(0).toISOString()),
    id: record.id,
    immutable: true,
    reason: nullableStringFromMetadata(record.reason),
    result: stringFromMetadata(record.result, ""),
    severity: serviceAdminAuditSeverityFromRow(stringFromMetadata(record.severity, "warning")),
    target: stringFromMetadata(record.target, ""),
    tenantId: nullableStringFromMetadata(record.tenantId),
    traceId: stringFromMetadata(record.traceId, ""),
    userId: nullableStringFromMetadata(record.userId)
  };
}

function arrayFromMetadata(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

function numberFromMetadata(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFromMetadata(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function nullableStringFromMetadata(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function defaultRbacPolicyVersion(): IdentityRbacPolicyVersion {
  return {
    activatedAt: "2026-06-28T00:00:00.000Z",
    checksum: "sha256:default-rbac-policy",
    createdAt: "2026-06-28T00:00:00.000Z",
    createdBy: "system",
    description: "Default RBAC policy generated from the canonical permission catalog.",
    id: "rbac-policy-default",
    status: "active",
    version: "2026.06.28-default"
  };
}

function defaultRbacRoleGrants(): IdentityRbacRoleGrant[] {
  const policy = defaultRbacPolicyVersion();
  return identityPermissionRoleCatalog.flatMap((role) => Array.from(new Set(role.actions)).map((action, index) => ({
    action,
    createdAt: "2026-06-28T00:00:00.000Z",
    createdBy: "system",
    effect: "allow" as const,
    id: `rbac-grant-default-${role.key}-${index}`,
    policyVersionId: policy.id,
    resource: "*",
    roleKey: role.key,
    tenantId: null,
    traceId: "trc_rbac_default"
  })));
}

export function createEmptyIdentityState(): IdentityState {
  return {
    authInviteTokens: [],
    authRecoveryTokens: [],
    breakGlassApprovals: [],
    credentialAuditEvents: [],
    mfaChallenges: [],
    oidcCallbackDescriptors: [],
    oidcProviderConfigs: [],
    outbox: [],
    passwordCredentials: [],
    passwordPolicies: [{
      maxFailedAttempts: 5,
      minLength: 12,
      requireMfa: true,
      scope: "service-admin",
      updatedAt: "2026-06-28T00:00:00.000Z"
    }],
    permissionDenialEvents: [],
    permissionRoles: clone(identityPermissionRoleCatalog),
    privilegedServiceAdminActions: [...serviceAdminPrivilegedActions],
    rbacPolicyVersions: [defaultRbacPolicyVersion()],
    rbacRoleGrants: defaultRbacRoleGrants(),
    serviceAdminFeatureFlags: [],
    serviceAdminIncidents: [],
    serviceAdminTariffs: clone(identityServiceAdminTariffCatalog),
    samlAcsRequestDescriptors: [],
    samlAssertionReplays: [],
    samlProviderMetadata: [],
    serviceAdminAuditEvents: [],
    serviceAdminAuditExports: [],
    serviceAdminAuditRedactions: [],
    serviceAdminImpersonations: [],
    serviceAdminSessions: [],
    serviceAdminTokenPairs: [],
    serviceAdminTokenRevocations: [],
    serviceAdminTokenRotations: [],
    tenantAuditEvents: [],
    tenantUsers: [],
    tenants: []
  };
}

function seedIdentityPasswordCredentials(): IdentityPasswordCredential[] {
  return [];
}
