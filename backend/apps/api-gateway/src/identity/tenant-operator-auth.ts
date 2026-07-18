import { randomUUID } from "node:crypto";
import { SetMetadata } from "@nestjs/common";
import { addMinutes } from "./backend-ids.js";
import type { IdentityPermissionRole } from "./identity.repository.js";

export const TENANT_OPERATOR_PERMISSION_KEY = "tenantOperatorPermission";

// Пользовательская сессия (оператор и service-admin) живёт 12 часов после последней
// активности: гварды продлевают expiresAt при каждом аутентифицированном запросе.
export const SESSION_IDLE_TTL_MINUTES = 12 * 60;

export interface TenantOperatorContext {
  permissions: string[];
  sessionId: string;
  tenantId: string;
  userId: string;
}

export interface TenantOperatorRequest {
  headers: Record<string, string | string[] | undefined>;
  tenantOperatorContext?: TenantOperatorContext;
}

export interface TenantOperatorSessionTokens {
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenHash: string;
  id: string;
  issuedAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  refreshTokenHash: string;
  sessionId: string;
  subjectId: string;
}

export const RequireTenantOperatorPermission = (action: string) => SetMetadata(TENANT_OPERATOR_PERMISSION_KEY, action);

export function createTenantOperatorSessionTokens({
  hashToken,
  sessionId,
  subjectId,
  ttlMinutes = SESSION_IDLE_TTL_MINUTES,
  refreshTtlMinutes = 60 * 24 * 14
}: {
  hashToken: (token: string) => string;
  refreshTtlMinutes?: number;
  sessionId: string;
  subjectId: string;
  ttlMinutes?: number;
}): TenantOperatorSessionTokens {
  const issuedAtDate = new Date();
  const accessToken = `top_access_${randomUUID()}`;
  const refreshToken = `top_refresh_${randomUUID()}`;

  return {
    accessToken,
    accessTokenExpiresAt: addMinutes(issuedAtDate, ttlMinutes).toISOString(),
    accessTokenHash: hashToken(accessToken),
    id: `top_pair_${randomUUID()}`,
    issuedAt: issuedAtDate.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: addMinutes(issuedAtDate, refreshTtlMinutes).toISOString(),
    refreshTokenHash: hashToken(refreshToken),
    sessionId,
    subjectId
  };
}

export function resolveTenantOperatorPermissions(role: string, permissionRoles: IdentityPermissionRole[]): string[] {
  const normalizedRole = normalizeTenantOperatorRole(role);
  const permissionRole = permissionRoles.find((item) =>
    item.key.toLowerCase() === normalizedRole
    || item.aliases.some((alias) => alias.toLowerCase() === normalizedRole)
  );

  return permissionRole ? [...permissionRole.actions] : [];
}

function normalizeTenantOperatorRole(role: string): string {
  const normalizedRole = role.trim().toLowerCase();
  if (["admin", "administrator", "owner", "владелец", "админ", "администратор"].includes(normalizedRole)) {
    return "admin";
  }

  if (["employee", "operator", "line_1", "line-1", "сотрудник"].includes(normalizedRole)) {
    return "employee";
  }

  if (normalizedRole === "senior operator") {
    return "senior";
  }

  if (["senior", "senior_operator", "lead", "старший", "старший сотрудник"].includes(normalizedRole)) {
    return "senior";
  }

  return normalizedRole;
}

export function readBearerTokenFromAuthorization(authorizationHeader: string): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1]?.trim() ?? "";
}
