export interface ServiceAdminSessionRecord {
  id: string;
  actorId: string;
  actorName: string;
  allowedActions: string[];
  currentTenantId?: string;
  expiresAt: string;
  mfaVerifiedAt: string | null;
  revokedAt?: string | null;
}

export interface ServiceAdminContext {
  actor: {
    id: string;
    name: string;
  };
  currentTenantId?: string;
  permissions: string[];
  sessionId: string;
}

export type ServiceAdminContextDecision =
  | ({ allowed: true } & ServiceAdminContext)
  | {
      allowed: false;
      code: "mfa_required" | "permission_denied" | "session_expired" | "session_not_found" | "session_revoked";
      status: "forbidden" | "unauthorized";
    };

export interface ResolveServiceAdminContextInput {
  headers: Record<string, string | string[] | undefined>;
  requiredAction?: string;
  sessionLookup: (sessionId: string) => ServiceAdminSessionRecord | null | undefined;
}

export interface ResolveServiceAdminContextAsyncInput {
  headers: Record<string, string | string[] | undefined>;
  requiredAction?: string;
  sessionLookup: (sessionId: string) => Promise<ServiceAdminSessionRecord | null | undefined> | ServiceAdminSessionRecord | null | undefined;
}

export function resolveServiceAdminContext({
  headers,
  requiredAction,
  sessionLookup
}: ResolveServiceAdminContextInput): ServiceAdminContextDecision {
  const sessionId = readBearerToken(headers.authorization) || readHeader(headers, "x-service-admin-session-id");
  const session = sessionId ? sessionLookup(sessionId) : null;

  return resolveDecision({ requiredAction, session, sessionId });
}

export async function resolveServiceAdminContextAsync({
  headers,
  requiredAction,
  sessionLookup
}: ResolveServiceAdminContextAsyncInput): Promise<ServiceAdminContextDecision> {
  const sessionId = readBearerToken(headers.authorization) || readHeader(headers, "x-service-admin-session-id");
  const session = sessionId ? await sessionLookup(sessionId) : null;

  return resolveDecision({ requiredAction, session, sessionId });
}

function resolveDecision({
  requiredAction,
  session,
  sessionId
}: {
  requiredAction?: string;
  session: ServiceAdminSessionRecord | null | undefined;
  sessionId: string;
}): ServiceAdminContextDecision {
  if (!session) {
    return { allowed: false, code: "session_not_found", status: "unauthorized" };
  }

  if (session.revokedAt) {
    return { allowed: false, code: "session_revoked", status: "unauthorized" };
  }

  if (!session.mfaVerifiedAt) {
    return { allowed: false, code: "mfa_required", status: "forbidden" };
  }

  if (!Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= Date.now()) {
    return { allowed: false, code: "session_expired", status: "unauthorized" };
  }

  if (requiredAction && !hasAction(session.allowedActions, requiredAction)) {
    return { allowed: false, code: "permission_denied", status: "forbidden" };
  }

  return {
    allowed: true,
    actor: {
      id: session.actorId,
      name: session.actorName
    },
    ...(session.currentTenantId ? { currentTenantId: session.currentTenantId } : {}),
    permissions: [...session.allowedActions],
    sessionId: session.id
  };
}

export function hasAction(permissions: string[], requiredAction: string): boolean {
  return permissions.includes("*") || permissions.includes(requiredAction);
}

function readBearerToken(value: string | string[] | undefined): string {
  const header = Array.isArray(value) ? value[0] : value;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match?.[1]?.trim() ?? "";
}

function readHeader(headers: Record<string, string | string[] | undefined>, name: string): string {
  const direct = headers[name] ?? headers[name.toLowerCase()];
  const value = Array.isArray(direct) ? direct[0] : direct;
  return value?.trim() ?? "";
}
