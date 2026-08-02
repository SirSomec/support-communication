import { randomUUID } from "node:crypto";
import { SetMetadata } from "@nestjs/common";
import { addMinutes } from "./backend-ids.js";
export const TENANT_OPERATOR_PERMISSION_KEY = "tenantOperatorPermission";
// Пользовательская сессия (оператор и service-admin) живёт 12 часов после последней
// активности: гварды продлевают expiresAt при каждом аутентифицированном запросе.
export const SESSION_IDLE_TTL_MINUTES = 12 * 60;
export const RequireTenantOperatorPermission = (action) => SetMetadata(TENANT_OPERATOR_PERMISSION_KEY, action);
export function createTenantOperatorSessionTokens({ hashToken, sessionId, subjectId, ttlMinutes = SESSION_IDLE_TTL_MINUTES, refreshTtlMinutes = 60 * 24 * 14 }) {
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
export function resolveTenantOperatorPermissions(role, permissionRoles) {
    const normalizedRole = normalizeTenantOperatorRole(role);
    const permissionRole = permissionRoles.find((item) => item.key.toLowerCase() === normalizedRole
        || item.aliases.some((alias) => alias.toLowerCase() === normalizedRole));
    return permissionRole ? [...permissionRole.actions] : [];
}
function normalizeTenantOperatorRole(role) {
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
export function readBearerTokenFromAuthorization(authorizationHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
    return match?.[1]?.trim() ?? "";
}
//# sourceMappingURL=tenant-operator-auth.js.map