import type { IdentityPermissionRole } from "./identity.repository.js";
export declare const TENANT_OPERATOR_PERMISSION_KEY = "tenantOperatorPermission";
export declare const SESSION_IDLE_TTL_MINUTES: number;
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
export declare const RequireTenantOperatorPermission: (action: string) => import("@nestjs/common").CustomDecorator<string>;
export declare function createTenantOperatorSessionTokens({ hashToken, sessionId, subjectId, ttlMinutes, refreshTtlMinutes }: {
    hashToken: (token: string) => string;
    refreshTtlMinutes?: number;
    sessionId: string;
    subjectId: string;
    ttlMinutes?: number;
}): TenantOperatorSessionTokens;
export declare function resolveTenantOperatorPermissions(role: string, permissionRoles: IdentityPermissionRole[]): string[];
export declare function readBearerTokenFromAuthorization(authorizationHeader: string): string;
