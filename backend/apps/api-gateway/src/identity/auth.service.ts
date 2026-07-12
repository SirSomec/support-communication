import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createOutboxEvent, type OutboxEvent } from "@support-communication/events";
import { addMinutes, makeAuditId } from "./backend-ids.js";
import {
  IdentityRepository,
  hashServiceAdminToken,
  type IdentityCredentialAuditEvent,
  type StoredServiceAdminSession,
  type StoredTenantOperatorSession,
  verifyPasswordCredential
} from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";
import { resolveTenantOperatorPermissions, createTenantOperatorSessionTokens } from "./tenant-operator-auth.js";
import {
  findTenantUserForMembership,
  type IdentityTenantMembershipChoice,
  listTenantMembershipsForEmail,
  selectTenantMembership
} from "./identity-auth-flow.repository.js";
import { createMfaOtpRuntimeFromEnv, type MfaOtpRuntime } from "./mfa-otp.js";

const SERVICE = "authService";

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

interface LoginContext {
  privileged?: boolean;
}

interface StartOidcLoginPayload {
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

export type LoginData =
  | {
      authenticated: false;
      authState: "anonymous";
      nextStep: "password";
    }
  | {
      authenticated: false;
      authState: "mfa_required";
      email?: string;
      mfaChallengeId?: string;
      nextStep: "otp";
    }
  | {
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
  refreshToken?: string;
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

export class AuthService {
  constructor(
    private readonly identityRepository = IdentityRepository.default(),
    private readonly mfaOtp = createMfaOtpRuntimeFromEnv()
  ) {}

  async getAuthState(context: { sessionId?: string } = {}): Promise<BackendEnvelope<AuthStateData>> {
    if (context.sessionId) {
      const session = await this.identityRepository.findServiceAdminSession(context.sessionId);

      const denied = resolveSessionStateDenial(session);
      if (denied) {
        return createEnvelope({
          service: SERVICE,
          operation: "getAuthState",
          traceId: identityTraceId(SERVICE, "getAuthState"),
          status: "denied",
          meta: apiMeta(),
          data: {
            authenticated: false,
            session: null,
            states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
            impersonating: false
          },
          error: {
            code: denied.code,
            message: denied.message
          }
        });
      }
      if (!session) {
        throw new Error("Service-admin session denial was not resolved.");
      }

      return createEnvelope({
        service: SERVICE,
        operation: "getAuthState",
        traceId: identityTraceId(SERVICE, "getAuthState"),
        meta: apiMeta(),
        data: {
          authenticated: true,
          session,
          states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
          impersonating: false
        }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "getAuthState",
      traceId: identityTraceId(SERVICE, "getAuthState"),
      meta: apiMeta(),
      data: {
        authenticated: false,
        session: null,
        states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
        impersonating: false
      }
    });
  }

  async login(
    { email, mfaChallengeId, otp, password }: LoginPayload = {},
    { privileged = false }: LoginContext = {}
  ): Promise<BackendEnvelope<LoginData>> {
    const traceId = identityTraceId(SERVICE, "login");
    const loginEmail = String(email ?? "").trim();

    if (!loginEmail) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          nextStep: "password"
        },
        error: { code: "email_required", message: "Email is required before password verification." }
      });
    }

    if (!password) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          nextStep: "password"
        },
        error: { code: "password_required", message: "Password is required before MFA challenge." }
      });
    }

    const credential = await this.identityRepository.findPasswordCredentialByEmail(loginEmail);
    const passwordValid = verifyPasswordCredential(password, credential);
    const credentialAuditEvent: IdentityCredentialAuditEvent = {
      action: "credential.password.verify",
      actor: credential?.subjectId ?? "unknown",
      at: new Date().toISOString(),
      id: makeAuditId("credential_password"),
      immutable: true,
      reason: passwordValid ? "Password hash matched policy credential." : "Password hash did not match policy credential.",
      result: passwordValid ? "ok" : "denied",
      subjectId: credential?.subjectId ?? "unknown",
      traceId
    };
    await this.identityRepository.recordCredentialAuditEvent(credentialAuditEvent);

    if (!passwordValid) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          nextStep: "password"
        },
        error: {
          code: "invalid_credentials",
          message: "Password credentials are invalid."
        }
      });
    }

    const tenantUser = await this.identityRepository.findTenantUserByEmail(loginEmail);
    if (tenantUser || !credential?.subjectId.startsWith("svc-admin")) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          nextStep: "password"
        },
        error: {
          code: "service_admin_subject_required",
          message: "Service-admin login requires a service-admin subject."
        }
      });
    }

    if (!otp) {
      const challenge = await this.createAndDeliverMfaChallenge(loginEmail);

      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        partial: true,
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "mfa_required",
          email: loginEmail,
          mfaChallengeId: challenge.id,
          nextStep: "otp"
        }
      });
    }

    const challenge = await this.identityRepository.consumeMfaChallenge({
      challengeId: mfaChallengeId,
      email: loginEmail,
      otpHash: this.mfaOtp.hash(loginEmail, otp)
    });

    if (!challenge.valid) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "mfa_required",
          email: loginEmail,
          nextStep: "otp"
        },
        error: {
          code: challenge.code,
          message: challenge.message
        }
      });
    }

    const availableOrganizations = (await this.identityRepository.listTenants()).map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      role: "service_admin"
    }));
    const session = await this.identityRepository.createServiceAdminSession({
      actorId: credential.subjectId,
      actorName: loginEmail,
      adminEmail: loginEmail,
      availableOrganizations,
      currentTenantId: availableOrganizations[0]?.id ?? "",
      mfaVerified: true
    });
    const tokenPair = createTenantOperatorSessionTokens({
      hashToken: hashServiceAdminToken,
      sessionId: session.id,
      subjectId: session.adminId
    });
    await this.identityRepository.createServiceAdminTokenPair({
      accessTokenExpiresAt: tokenPair.accessTokenExpiresAt,
      accessTokenHash: tokenPair.accessTokenHash,
      id: tokenPair.id,
      issuedAt: tokenPair.issuedAt,
      refreshTokenExpiresAt: tokenPair.refreshTokenExpiresAt,
      refreshTokenHash: tokenPair.refreshTokenHash,
      sessionId: tokenPair.sessionId,
      subjectId: tokenPair.subjectId
    });
    const outbox = await this.identityRepository.appendOutbox(createOutboxEvent({
      aggregateId: session.id,
      aggregateType: "service-admin-session",
      payload: { adminId: session.adminId, authState: session.authState },
      queue: "identity-events",
      traceId,
      type: "service_admin.login"
    }));

    return createEnvelope({
      service: SERVICE,
      operation: "login",
      traceId,
      meta: apiMeta(),
      data: {
        authenticated: true,
        authState: "mfa_verified",
        accessToken: tokenPair.accessToken,
        session,
        auditEvent: {
          id: makeAuditId("auth"),
          action: "service_admin.login",
          immutable: true,
          result: "ok"
        },
        outbox
      }
    });
  }

  async startOidcLogin({
    providerId = "oidc-main",
    redirectUri
  }: StartOidcLoginPayload = {}): Promise<BackendEnvelope<OidcLoginStartData>> {
    const traceId = identityTraceId(SERVICE, "startOidcLogin");
    if (!redirectUri) {
      return createEnvelope({
        service: SERVICE,
        operation: "startOidcLogin",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authorizationUrl: "",
          callbackDescriptorId: "",
          expiresAt: "",
          providerId,
          redirectUri: "",
          state: ""
        },
        error: {
          code: "oidc_redirect_uri_required",
          message: "OIDC redirect URI is required."
        }
      });
    }

    const provider = await this.identityRepository.findOidcProviderConfig(providerId);
    if (!provider) {
      return createEnvelope({
        service: SERVICE,
        operation: "startOidcLogin",
        traceId,
        status: "not_found",
        meta: apiMeta(),
        data: {
          authorizationUrl: "",
          callbackDescriptorId: "",
          expiresAt: "",
          providerId,
          redirectUri,
          state: ""
        },
        error: {
          code: "oidc_provider_not_found",
          message: "OIDC provider config was not found."
        }
      });
    }

    if (!provider.enabled) {
      return createEnvelope({
        service: SERVICE,
        operation: "startOidcLogin",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authorizationUrl: "",
          callbackDescriptorId: "",
          expiresAt: "",
          providerId,
          redirectUri,
          state: ""
        },
        error: {
          code: "oidc_provider_disabled",
          message: "OIDC provider is disabled."
        }
      });
    }

    const now = new Date();
    const expiresAt = addMinutes(now, 10).toISOString();
    const state = `oidc_state_${randomUUID()}`;
    const nonce = `oidc_nonce_${randomUUID()}`;
    const callbackDescriptorId = `oidc_cb_${randomUUID()}`;
    await this.identityRepository.recordOidcCallbackDescriptor({
      consumedAt: null,
      expiresAt,
      id: callbackDescriptorId,
      nonceHash: hashOidcValue(nonce),
      providerId,
      redirectUri,
      requestedAt: now.toISOString(),
      state,
      traceId
    });

    return createEnvelope({
      service: SERVICE,
      operation: "startOidcLogin",
      traceId,
      partial: true,
      meta: apiMeta({ tenantId: provider.tenantId }),
      data: {
        authorizationUrl: buildOidcAuthorizationUrl(provider, { nonce, redirectUri, state }),
        callbackDescriptorId,
        expiresAt,
        providerId,
        redirectUri,
        state
      }
    });
  }

  async completeOidcCallback({
    code,
    error,
    errorDescription,
    state
  }: CompleteOidcCallbackPayload = {}): Promise<BackendEnvelope<OidcCallbackData>> {
    const traceId = identityTraceId(SERVICE, "completeOidcCallback");
    const consumed = await this.identityRepository.consumeOidcCallbackDescriptor({ state });
    if (consumed.status !== "consumed") {
      return createEnvelope({
        service: SERVICE,
        operation: "completeOidcCallback",
        traceId,
        status: consumed.status === "replayed" ? "conflict" : "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          callbackDescriptorId: consumed.descriptor?.id,
          nextStep: "authorization",
          providerId: consumed.descriptor?.providerId,
          state
        },
        error: {
          code: consumed.code,
          message: consumed.message
        }
      });
    }

    if (error) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeOidcCallback",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          callbackDescriptorId: consumed.descriptor.id,
          consumedAt: consumed.descriptor.consumedAt ?? new Date().toISOString(),
          nextStep: "authorization",
          providerId: consumed.descriptor.providerId,
          state
        },
        error: {
          code: "oidc_provider_error",
          message: errorDescription || error
        }
      });
    }

    if (!code) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeOidcCallback",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          authState: "anonymous",
          callbackDescriptorId: consumed.descriptor.id,
          consumedAt: consumed.descriptor.consumedAt ?? new Date().toISOString(),
          nextStep: "authorization",
          providerId: consumed.descriptor.providerId,
          state
        },
        error: {
          code: "oidc_code_required",
          message: "OIDC authorization code is required."
        }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "completeOidcCallback",
      traceId,
      partial: true,
      meta: apiMeta(),
      data: {
        authenticated: false,
        authState: "oidc_callback_verified",
        callbackDescriptorId: consumed.descriptor.id,
        consumedAt: consumed.descriptor.consumedAt ?? new Date().toISOString(),
        nextStep: "token_exchange",
        providerId: consumed.descriptor.providerId,
        state: consumed.descriptor.state
      }
    });
  }

  async completeSamlAcs({
    assertionExpiresAt,
    assertionId,
    audience,
    now = new Date(),
    providerId = "saml-main",
    requestId,
    subjectId
  }: CompleteSamlAcsPayload = {}): Promise<BackendEnvelope<SamlAcsData>> {
    const traceId = identityTraceId(SERVICE, "completeSamlAcs");
    const baseData: SamlAcsData = {
      assertionExpiresAt,
      assertionId,
      authenticated: false,
      authState: "anonymous",
      nextStep: "authorization",
      providerId,
      requestId,
      subjectId
    };

    if (!assertionId || !audience || !requestId || !subjectId) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: baseData,
        error: {
          code: "saml_assertion_required",
          message: "SAML assertion id, audience, request id and subject id are required."
        }
      });
    }

    const provider = await this.identityRepository.findSamlProviderMetadata(providerId);
    if (!provider) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: baseData,
        error: {
          code: "saml_provider_not_found",
          message: "SAML provider metadata was not found."
        }
      });
    }

    if (!provider.enabled) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: "saml_provider_disabled",
          message: "SAML provider is disabled."
        }
      });
    }

    const existingReplay = await this.identityRepository.findSamlAssertionReplay(providerId, assertionId);
    if (existingReplay) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "conflict",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: "saml_assertion_replayed",
          message: "SAML assertion was already processed."
        }
      });
    }

    const consumedAcs = await this.identityRepository.consumeSamlAcsRequestDescriptor({ now, requestId });
    if (consumedAcs.status !== "consumed") {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: consumedAcs.status === "replayed" ? "conflict" : consumedAcs.status === "expired" ? "denied" : "invalid",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: consumedAcs.code,
          message: consumedAcs.message
        }
      });
    }

    const acsDescriptor = consumedAcs.descriptor;
    if (acsDescriptor.providerId !== provider.providerId) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: "saml_acs_provider_mismatch",
          message: "SAML ACS request descriptor does not belong to this provider."
        }
      });
    }

    if (audience !== provider.audience) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: "saml_audience_mismatch",
          message: "SAML assertion audience does not match the provider metadata."
        }
      });
    }

    if (!assertionExpiresAt || !Number.isFinite(Date.parse(assertionExpiresAt)) || Date.parse(assertionExpiresAt) <= now.getTime()) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeSamlAcs",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: provider.tenantId }),
        data: baseData,
        error: {
          code: "saml_assertion_expired",
          message: "SAML assertion has expired."
        }
      });
    }

    try {
      await this.identityRepository.recordSamlAssertionReplay({
        assertionId,
        audience,
        expiresAt: assertionExpiresAt,
        providerId,
        receivedAt: now.toISOString(),
        requestId,
        subjectId,
        traceId
      });
    } catch (error) {
      if (isSamlAssertionReplayConflict(error)) {
        return createEnvelope({
          service: SERVICE,
          operation: "completeSamlAcs",
          traceId,
          status: "conflict",
          meta: apiMeta({ tenantId: provider.tenantId }),
          data: baseData,
          error: {
            code: "saml_assertion_replayed",
            message: "SAML assertion was already processed."
          }
        });
      }
      throw error;
    }

    return createEnvelope({
      service: SERVICE,
      operation: "completeSamlAcs",
      traceId,
      partial: true,
      meta: apiMeta({ tenantId: provider.tenantId }),
      data: {
        ...baseData,
        authState: "saml_assertion_verified",
        nextStep: "session_issue"
      }
    });
  }

  async logout({ reason = "Service admin logged out", sessionId }: { reason?: string; sessionId?: string } = {}): Promise<BackendEnvelope<LogoutData>> {
    const traceId = identityTraceId(SERVICE, "logout");
    const revoked = await this.identityRepository.revokeServiceAdminSession(sessionId);
    const outbox = sessionId ? await this.identityRepository.appendOutbox(createOutboxEvent({
      aggregateId: sessionId,
      aggregateType: "service-admin-session",
      payload: { reason, revoked: Boolean(revoked) },
      queue: "identity-events",
      traceId,
      type: "service_admin.logout"
    })) : undefined;

    return createEnvelope({
      service: SERVICE,
      operation: "logout",
      traceId,
      meta: apiMeta(),
      data: {
        authenticated: false,
        authState: "anonymous",
        reason,
        auditEvent: {
          id: makeAuditId("auth_logout"),
          action: "service_admin.logout",
          immutable: true,
          reason
        },
        outbox
      }
    });
  }

  async loginTenantOperator(
    { email, mfaChallengeId, otp, password, tenantId }: TenantOperatorLoginPayload = {},
    { forceMfa = false }: TenantOperatorLoginContext = {}
  ): Promise<BackendEnvelope<TenantOperatorLoginData>> {
    const traceId = identityTraceId(SERVICE, "loginTenantOperator");
    const tenantMfaRequired = forceMfa || !shouldSkipTenantOperatorMfa();
    const completingMfaChallenge = tenantMfaRequired && Boolean(mfaChallengeId && otp);
    const requestedTenantId = String(tenantId ?? "").trim();
    let normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (completingMfaChallenge && !normalizedEmail) {
      const challenge = await this.identityRepository.findMfaChallenge(mfaChallengeId);
      normalizedEmail = challenge?.email ?? "";
    }

    if (!normalizedEmail || (!password && !completingMfaChallenge)) {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: null
        },
        error: {
          code: "tenant_operator_credentials_required",
          message: "Tenant operator email and password are required."
        }
      });
    }

    const credential = password ? await this.identityRepository.findPasswordCredentialByEmail(normalizedEmail) : undefined;
    if (password && !verifyPasswordCredential(password, credential)) {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: null
        },
        error: {
          code: "invalid_credentials",
          message: "Password credentials are invalid."
        }
      });
    }

    const tenantUser = await this.identityRepository.findTenantUserByEmail(normalizedEmail);
    if (!tenantUser || tenantUser.status !== "active") {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: tenantUser?.tenantId ?? null
        },
        error: {
          code: tenantUser?.status === "inactive" ? "tenant_operator_blocked" : "tenant_operator_not_available",
          message: tenantUser?.status === "inactive"
            ? "Tenant operator account is blocked or inactive."
            : "Tenant operator account is missing or inactive."
        }
      });
    }

    const memberships = await listTenantMembershipsForEmail(normalizedEmail, this.identityRepository);
    const selectedMembership = requestedTenantId
      ? memberships.find((membership) => membership.tenantId === requestedTenantId)
      : null;

    if (requestedTenantId && !selectedMembership) {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: requestedTenantId }),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: requestedTenantId
        },
        error: {
          code: "tenant_membership_not_found",
          message: "Selected tenant membership is not available for this account."
        }
      });
    }

    if (memberships.length > 1 && !selectedMembership) {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          memberships: serializeTenantMemberships(memberships),
          operator: null,
          permissions: [],
          tenantId: null
        },
        error: {
          code: "multi_tenant_membership",
          message: "Multiple tenant memberships require explicit tenant selection."
        }
      });
    }

    const effectiveTenantUser = selectedMembership
      ? await findTenantUserForMembership(normalizedEmail, selectedMembership.tenantId, this.identityRepository)
      : tenantUser;

    if (!effectiveTenantUser || effectiveTenantUser.status !== "active") {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: selectedMembership?.tenantId ?? tenantUser.tenantId
        },
        error: {
          code: "tenant_membership_not_found",
          message: "Selected tenant membership is not available for this account."
        }
      });
    }

    const tenant = await this.identityRepository.findTenant(effectiveTenantUser.tenantId);
    if (tenant?.status === "restricted") {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: effectiveTenantUser.tenantId }),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: effectiveTenantUser.tenantId
        },
        error: {
          code: "tenant_blocked",
          message: "Tenant access is blocked by policy or administrator action."
        }
      });
    }

    if (String(process.env.AUTH_MAINTENANCE_MODE ?? "").trim().toLowerCase() === "true") {
      return createEnvelope({
        service: SERVICE,
        operation: "loginTenantOperator",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: effectiveTenantUser.tenantId }),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          tenantId: effectiveTenantUser.tenantId
        },
        error: {
          code: "tenant_maintenance",
          message: "Authentication is temporarily unavailable due to maintenance."
        }
      });
    }

    if (tenantMfaRequired) {
      if (!otp) {
        const challenge = await this.createAndDeliverMfaChallenge(normalizedEmail);
        return createEnvelope({
          service: SERVICE,
          operation: "loginTenantOperator",
          traceId,
          partial: true,
          meta: apiMeta({ tenantId: effectiveTenantUser.tenantId }),
          data: {
            authenticated: false,
            mfaChallengeId: challenge.id,
            nextStep: "otp",
            operator: null,
            permissions: [],
            tenantId: effectiveTenantUser.tenantId
          }
        });
      }

      const challenge = await this.identityRepository.consumeMfaChallenge({
        challengeId: mfaChallengeId,
        email: normalizedEmail,
        otpHash: this.mfaOtp.hash(normalizedEmail, otp)
      });
      if (!challenge.valid) {
        return createEnvelope({
          service: SERVICE,
          operation: "loginTenantOperator",
          traceId,
          status: "invalid",
          meta: apiMeta({ tenantId: effectiveTenantUser.tenantId }),
          data: {
            authenticated: false,
            nextStep: "otp",
            operator: null,
            permissions: [],
            tenantId: effectiveTenantUser.tenantId
          },
          error: {
            code: challenge.code,
            message: challenge.message
          }
        });
      }
    }

    const createdSession = await this.identityRepository.createTenantOperatorSession({
      tenantId: effectiveTenantUser.tenantId,
      userId: effectiveTenantUser.id
    });
    const permissionRoles = await this.identityRepository.listPermissionRoles();
    const permissions = resolveTenantOperatorPermissions(effectiveTenantUser.role, permissionRoles);

    return createEnvelope({
      service: SERVICE,
      operation: "loginTenantOperator",
      traceId,
      meta: apiMeta({ tenantId: effectiveTenantUser.tenantId }),
      data: {
        accessToken: createdSession.accessToken,
        authenticated: true,
        operator: {
          email: effectiveTenantUser.email,
          id: effectiveTenantUser.id,
          name: effectiveTenantUser.name,
          role: effectiveTenantUser.role
        },
        permissions,
        refreshToken: createdSession.refreshToken,
        tenantId: effectiveTenantUser.tenantId
      }
    });
  }

  private async createAndDeliverMfaChallenge(email: string) {
    const issued = this.mfaOtp.issue(email);
    const challenge = await this.identityRepository.createMfaChallenge({
      email,
      otpHash: issued.otpHash
    });
    await this.mfaOtp.deliver({
      challengeId: challenge.id,
      email: challenge.email,
      expiresAt: challenge.expiresAt,
      otp: issued.otp
    });
    return challenge;
  }

  async getTenantOperatorState({ sessionId }: TenantOperatorSessionContext = {}): Promise<BackendEnvelope<TenantOperatorStateData>> {
    const traceId = identityTraceId(SERVICE, "getTenantOperatorState");
    const session = await this.identityRepository.findTenantOperatorSession(sessionId);
    const denied = resolveTenantOperatorSessionDenial(session);
    if (denied) {
      return createEnvelope({
        service: SERVICE,
        operation: "getTenantOperatorState",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: {
          authenticated: false,
          operator: null,
          permissions: [],
          sessionId: null,
          tenantId: null
        },
        error: denied
      });
    }
    if (!session) {
      throw new Error("Tenant operator session denial was not resolved.");
    }

    const user = await this.identityRepository.findTenantUser(session.userId);
    const permissions = [...session.allowedActions];

    return createEnvelope({
      service: SERVICE,
      operation: "getTenantOperatorState",
      traceId,
      meta: apiMeta({ tenantId: session.tenantId }),
      data: {
        authenticated: true,
        operator: user ? {
          email: user.email,
          id: user.id,
          name: user.name,
          role: user.role
        } : {
          email: session.userEmail,
          id: session.userId,
          name: session.userName,
          role: session.role
        },
        permissions,
        sessionId: session.id,
        tenantId: session.tenantId
      }
    });
  }

  async logoutTenantOperator({ sessionId }: TenantOperatorSessionContext = {}): Promise<BackendEnvelope<TenantOperatorLogoutData>> {
    const traceId = identityTraceId(SERVICE, "logoutTenantOperator");
    const revoked = await this.identityRepository.revokeTenantOperatorSession({ sessionId });

    return createEnvelope({
      service: SERVICE,
      operation: "logoutTenantOperator",
      traceId,
      meta: apiMeta(),
      data: {
        authenticated: false,
        revoked,
        sessionId: sessionId ?? null
      }
    });
  }

  async acceptInvite({ code, email, mfaChallengeId, otp, password }: AcceptInvitePayload = {}) {
    const traceId = identityTraceId(SERVICE, "acceptInvite");
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const inviteCode = String(code ?? "").trim();

    if (mfaChallengeId && otp) {
      return this.loginTenantOperator({
        email: normalizedEmail,
        mfaChallengeId,
        otp
      });
    }

    if (!normalizedEmail || !inviteCode || !password) {
      return createEnvelope({
        service: SERVICE,
        operation: "acceptInvite",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: { authenticated: false },
        error: { code: "invite_payload_required", message: "Invite code, email, and password are required." }
      });
    }

    await seedDefaultAuthFlowFixtures(this.identityRepository);

    const consumed = await this.identityRepository.consumeInviteToken({ code: inviteCode, email: normalizedEmail });
    if (consumed.status !== "consumed") {
      await this.recordAuthFlowAudit({
        action: "auth.invite.accept",
        email: normalizedEmail,
        reason: consumed.message,
        result: "denied",
        traceId
      });
      return createEnvelope({
        service: SERVICE,
        operation: "acceptInvite",
        traceId,
        status: consumed.code === "invite_expired" ? "denied" : "invalid",
        meta: apiMeta(),
        data: { authenticated: false },
        error: { code: consumed.code, message: consumed.message }
      });
    }

    const invitedUser = await this.identityRepository.findTenantUserByEmail(normalizedEmail);
    if (!invitedUser || invitedUser.tenantId !== consumed.token.tenantId) {
      await this.recordAuthFlowAudit({
        action: "auth.invite.accept",
        email: normalizedEmail,
        reason: "Invite token did not match an invited tenant user.",
        result: "denied",
        traceId
      });
      return createEnvelope({
        service: SERVICE,
        operation: "acceptInvite",
        traceId,
        status: "invalid",
        meta: apiMeta({ tenantId: consumed.token.tenantId }),
        data: { authenticated: false },
        error: { code: "invite_membership_not_found", message: "Invite token does not match an invited tenant membership." }
      });
    }

    const activatedUser = await this.identityRepository.saveTenantUser({
      ...invitedUser,
      inviteStatus: "accepted",
      lastActiveAt: new Date().toISOString(),
      status: "active"
    });

    await this.identityRepository.savePasswordCredential({
      algorithm: "sha256",
      email: normalizedEmail,
      hash: `sha256:${createHash("sha256").update(password).digest("hex")}`,
      subjectId: activatedUser.id,
      updatedAt: new Date().toISOString(),
      version: 1
    });

    await this.recordAuthFlowAudit({
      action: "auth.invite.accept",
      email: normalizedEmail,
      reason: "Invite token consumed.",
      result: "ok",
      traceId
    });

    return this.loginTenantOperator({ email: normalizedEmail, password });
  }

  async requestRecovery({ email }: { email?: string } = {}) {
    const traceId = identityTraceId(SERVICE, "requestRecovery");
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!normalizedEmail) {
      return createEnvelope({
        service: SERVICE,
        operation: "requestRecovery",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: { queued: false },
        error: { code: "recovery_email_required", message: "Recovery email is required." }
      });
    }

    const user = await this.identityRepository.findTenantUserByEmail(normalizedEmail);
    const credential = await this.identityRepository.findPasswordCredentialByEmail(normalizedEmail);
    let auditReason = "Recovery request accepted.";
    let auditResult = "ok";

    if (user && credential) {
      try {
        const token = await this.identityRepository.createRecoveryToken(normalizedEmail);
        await this.mfaOtp.deliverRecovery({
          email: normalizedEmail,
          expiresAt: token.expiresAt,
          recoveryToken: token.token,
          requestId: token.id
        });
        auditReason = "Recovery token queued for delivery.";
      } catch {
        auditReason = "Recovery token delivery failed.";
        auditResult = "denied";
      }
    }

    await this.recordAuthFlowAudit({
      action: "auth.recovery.request",
      email: normalizedEmail,
      reason: auditReason,
      result: auditResult,
      traceId
    });

    return createEnvelope({
      service: SERVICE,
      operation: "requestRecovery",
      traceId,
      meta: apiMeta(),
      data: {
        queued: true
      }
    });
  }

  async completeRecovery({ email, mfaChallengeId, otp, password, token }: CompleteRecoveryPayload = {}) {
    const traceId = identityTraceId(SERVICE, "completeRecovery");
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    if (mfaChallengeId && otp) {
      return this.loginTenantOperator({
        email: normalizedEmail,
        mfaChallengeId,
        otp
      }, { forceMfa: true });
    }

    if (!normalizedEmail || !password || !token) {
      return createEnvelope({
        service: SERVICE,
        operation: "completeRecovery",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: { authenticated: false },
        error: { code: "recovery_payload_required", message: "Recovery token, email, and password are required." }
      });
    }

    const user = await this.identityRepository.findTenantUserByEmail(normalizedEmail);
    if (!user) {
      await this.recordAuthFlowAudit({
        action: "auth.recovery.complete",
        email: normalizedEmail,
        reason: "Recovery token did not match a tenant user.",
        result: "denied",
        traceId
      });
      return createEnvelope({
        service: SERVICE,
        operation: "completeRecovery",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: { authenticated: false },
        error: { code: "recovery_not_found", message: "Recovery token was not found." }
      });
    }

    const completedRecovery = await this.identityRepository.completePasswordRecovery({
      credential: {
        algorithm: "sha256",
        email: normalizedEmail,
        hash: `sha256:${createHash("sha256").update(password).digest("hex")}`,
        subjectId: user.id,
        updatedAt: new Date().toISOString(),
        version: 1
      },
      email: normalizedEmail,
      token
    });
    if (completedRecovery.status !== "consumed") {
      await this.recordAuthFlowAudit({
        action: "auth.recovery.complete",
        email: normalizedEmail,
        reason: completedRecovery.message,
        result: "denied",
        traceId
      });
      return createEnvelope({
        service: SERVICE,
        operation: "completeRecovery",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: { authenticated: false },
        error: { code: completedRecovery.code, message: completedRecovery.message }
      });
    }

    await this.recordAuthFlowAudit({
      action: "auth.recovery.complete",
      email: normalizedEmail,
      reason: `Recovery token consumed, password updated, ${completedRecovery.revokedSessions} sessions revoked.`,
      result: "ok",
      traceId
    });

    return this.loginTenantOperator({ email: normalizedEmail, password }, { forceMfa: true });
  }

  async selectTenant({ email, tenantId }: { email?: string; tenantId?: string } = {}) {
    const traceId = identityTraceId(SERVICE, "selectTenant");
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedTenantId = String(tenantId ?? "").trim();

    if (!normalizedEmail || !normalizedTenantId) {
      return createEnvelope({
        service: SERVICE,
        operation: "selectTenant",
        traceId,
        status: "invalid",
        meta: apiMeta(),
        data: { selected: false },
        error: { code: "tenant_selection_required", message: "Email and tenantId are required." }
      });
    }

    const selected = await selectTenantMembership(
      { email: normalizedEmail, tenantId: normalizedTenantId },
      this.identityRepository
    );
    if (!selected) {
      return createEnvelope({
        service: SERVICE,
        operation: "selectTenant",
        traceId,
        status: "denied",
        meta: apiMeta(),
        data: { selected: false },
        error: { code: "tenant_membership_not_found", message: "Tenant membership was not found for this account." }
      });
    }

    await this.recordAuthFlowAudit({
      action: "auth.tenant.select",
      email: normalizedEmail,
      reason: `Selected tenant ${normalizedTenantId}.`,
      result: "ok",
      traceId
    });

    return createEnvelope({
      service: SERVICE,
      operation: "selectTenant",
      traceId,
      meta: apiMeta({ tenantId: normalizedTenantId }),
      data: {
        selected: true,
        tenantId: normalizedTenantId,
        tenantName: selected.tenantName,
        role: selected.role
      }
    });
  }

  private async recordAuthFlowAudit(input: {
    action: string;
    email: string;
    reason: string;
    result: string;
    subjectId?: string;
    traceId: string;
  }): Promise<IdentityCredentialAuditEvent> {
    const event: IdentityCredentialAuditEvent = {
      action: input.action,
      actor: input.email,
      at: new Date().toISOString(),
      id: makeAuditId("auth_flow"),
      immutable: true,
      reason: input.reason,
      result: input.result,
      subjectId: input.subjectId ?? input.email,
      traceId: input.traceId
    };
    await this.identityRepository.recordCredentialAuditEvent(event);
    return event;
  }
}

function serializeTenantMemberships(memberships: IdentityTenantMembershipChoice[]): TenantOperatorLoginData["memberships"] {
  return memberships.map((membership) => ({
    id: membership.id,
    role: membership.role,
    selectedAt: membership.selectedAt,
    tenantId: membership.tenantId,
    tenantName: membership.tenantName
  }));
}

async function seedDefaultAuthFlowFixtures(repository: IdentityRepository): Promise<void> {
  if (!["development", "test"].includes(currentNodeEnv())) {
    return;
  }

  await repository.createInviteToken({
    code: "expired-token",
    email: "nikolai@lumen.example",
    expiresAt: "2026-01-01T00:00:00.000Z",
    tenantId: "tenant-lumen"
  });
}

function currentNodeEnv(): string {
  return process.env.NODE_ENV || "test";
}

function shouldSkipTenantOperatorMfa(): boolean {
  const localRuntime = ["development", "test"].includes(currentNodeEnv());
  const requireMfaInLocal = String(process.env.AUTH_REQUIRE_TENANT_MFA ?? "").trim().toLowerCase() === "true";
  return localRuntime && !requireMfaInLocal;
}

function buildOidcAuthorizationUrl(
  provider: {
    audience: string;
    clientId: string;
    issuer: string;
    scopes: string[];
  },
  {
    nonce,
    redirectUri,
    state
  }: {
    nonce: string;
    redirectUri: string;
    state: string;
  }
): string {
  const authorizationUrl = new URL("authorize", provider.issuer.endsWith("/") ? provider.issuer : `${provider.issuer}/`);
  authorizationUrl.searchParams.set("client_id", provider.clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", provider.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  if (provider.audience) {
    authorizationUrl.searchParams.set("audience", provider.audience);
  }
  return authorizationUrl.toString();
}

function hashOidcValue(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isSamlAssertionReplayConflict(error: unknown): boolean {
  const prismaError = error as { code?: unknown } | null;
  return (error instanceof Error && /SAML assertion replay already exists/.test(error.message))
    || prismaError?.code === "P2002";
}

function resolveSessionStateDenial(session: StoredServiceAdminSession | undefined): { code: string; message: string } | null {
  if (!session) {
    return { code: "session_not_found", message: "Service-admin session was not found." };
  }

  if (session.revokedAt) {
    return { code: "session_revoked", message: "Service-admin session was revoked." };
  }

  if (!session.mfaVerifiedAt) {
    return { code: "mfa_required", message: "Service-admin session requires MFA verification." };
  }

  if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
    return { code: "session_expired", message: "Service-admin session has expired." };
  }

  return null;
}

function resolveTenantOperatorSessionDenial(session: StoredTenantOperatorSession | undefined): { code: string; message: string } | null {
  if (!session) {
    return { code: "session_not_found", message: "Tenant operator session was not found." };
  }

  if (session.revokedAt) {
    return { code: "session_revoked", message: "Tenant operator session was revoked." };
  }

  if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
    return { code: "session_expired", message: "Tenant operator session has expired." };
  }

  return null;
}
