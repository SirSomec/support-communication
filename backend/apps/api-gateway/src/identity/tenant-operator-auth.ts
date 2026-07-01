import { randomUUID } from "node:crypto";
import { SetMetadata } from "@nestjs/common";
import { addMinutes } from "./backend-ids.js";
import type { IdentityPermissionRole } from "./identity.repository.js";

export const TENANT_OPERATOR_PERMISSION_KEY = "tenantOperatorPermission";

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
  ttlMinutes = 60,
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
  const normalizedRole = role.trim().toLowerCase();
  const permissionRole = permissionRoles.find((item) =>
    item.key.toLowerCase() === normalizedRole
    || item.aliases.some((alias) => alias.toLowerCase() === normalizedRole)
  );

  return permissionRole ? [...permissionRole.actions] : [];
}

export function readBearerTokenFromAuthorization(authorizationHeader: string): string {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1]?.trim() ?? "";
}
