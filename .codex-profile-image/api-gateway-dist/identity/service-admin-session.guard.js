var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { resolveServiceAdminContextAsync } from "@support-communication/auth-context";
import { loadBackendConfig } from "@support-communication/config";
import { makeAuditId } from "./backend-ids.js";
import { IdentityRepository } from "./identity.repository.js";
import { identityTraceId } from "./identity-meta.js";
import { isServiceAdminSessionId, SERVICE_ADMIN_ACTION_KEY } from "./service-admin-auth.js";
let ServiceAdminSessionGuard = class ServiceAdminSessionGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const requiredAction = this.reflector.getAllAndOverride(SERVICE_ADMIN_ACTION_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        const authorization = readHeader(request, "authorization");
        if (/^Bearer\s+/i.test(authorization)) {
            const bearerToken = readBearerToken(authorization);
            if (!bearerToken) {
                throw new UnauthorizedException("Bearer service-admin session is required for privileged identity endpoints.");
            }
            const repository = IdentityRepository.default();
            let resolvedSession = null;
            const decision = await resolveServiceAdminContextAsync({
                headers: request.headers,
                requiredAction,
                sessionLookup: async (token) => {
                    const session = (await repository.findServiceAdminSessionByAccessToken(token)) ?? null;
                    resolvedSession = isServiceAdminSessionId(session?.id) ? session : null;
                    return resolvedSession;
                }
            });
            if (!decision.allowed) {
                if (decision.code === "permission_denied" && requiredAction) {
                    const deniedSession = await repository.findServiceAdminSessionByAccessToken(bearerToken);
                    const activePolicy = await repository.getActiveRbacPolicyVersion();
                    const roleKey = resolvePermissionRoleKey(deniedSession?.role ?? "service_admin", await repository.listPermissionRoles());
                    await repository.recordPermissionDenialEvent({
                        action: requiredAction,
                        actorId: deniedSession?.actorId ?? null,
                        at: new Date().toISOString(),
                        id: makeAuditId("rbac_denial"),
                        immutable: true,
                        policyVersionId: activePolicy?.id ?? null,
                        reason: "Service-admin session does not include the required action.",
                        resource: "service-admin",
                        roleKey,
                        tenantId: null,
                        traceId: identityTraceId("serviceAdminGuard", "permissionDenied")
                    });
                }
                const message = `Service-admin session denied: ${decision.code}`;
                if (decision.status === "unauthorized") {
                    throw new UnauthorizedException(message);
                }
                throw new ForbiddenException(message);
            }
            try {
                await repository.touchServiceAdminSessionActivity({ accessToken: bearerToken });
            }
            catch {
                // Продление сессии best-effort: сбой записи не должен валить авторизованный запрос.
            }
            const contextRoles = resolvedSession ? [resolvedSession.role] : [];
            request.serviceAdminContext = {
                actor: decision.actor,
                ...(decision.currentTenantId ? { currentTenantId: decision.currentTenantId } : {}),
                permissions: decision.permissions,
                ...(contextRoles.length ? { roles: contextRoles } : {}),
                sessionId: decision.sessionId
            };
            return true;
        }
        const nodeEnv = process.env.NODE_ENV ?? "development";
        const demoHeadersAllowed = process.env.ALLOW_DEMO_SERVICE_ADMIN_HEADERS === "true"
            && (nodeEnv === "development" || nodeEnv === "test");
        if (!demoHeadersAllowed) {
            throw new UnauthorizedException("Bearer service-admin session is required for privileged identity endpoints.");
        }
        const config = loadBackendConfig();
        const expectedKey = config.DEMO_SERVICE_ADMIN_KEY;
        const header = request.headers["x-demo-service-admin-key"];
        const providedKey = Array.isArray(header) ? header[0] : header;
        if (providedKey !== expectedKey) {
            throw new UnauthorizedException("Demo service-admin key is required for privileged identity endpoints.");
        }
        if (!requiredAction) {
            return true;
        }
        const actorId = readHeader(request, "x-demo-service-admin-actor-id");
        const actorName = readHeader(request, "x-demo-service-admin-actor-name");
        const currentTenantId = readHeader(request, "x-demo-service-admin-tenant-id");
        const mfaVerified = readHeader(request, "x-demo-service-admin-mfa-verified") === "true";
        const sessionExpiresAt = Date.parse(readHeader(request, "x-demo-service-admin-session-expires-at"));
        const roles = readHeader(request, "x-demo-service-admin-roles")
            .split(",")
            .map((role) => role.trim())
            .filter(Boolean);
        const permissions = readHeader(request, "x-demo-service-admin-permissions")
            .split(",")
            .map((permission) => permission.trim())
            .filter(Boolean);
        if (!actorId || !actorName) {
            throw new ForbiddenException("A named service-admin actor is required for this operation.");
        }
        if (!mfaVerified || !Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
            throw new ForbiddenException("A verified, non-expired service-admin session is required for this operation.");
        }
        if (!permissions.includes("*") && !permissions.includes(requiredAction)) {
            const repository = IdentityRepository.default();
            const activePolicy = await repository.getActiveRbacPolicyVersion();
            const roleKey = resolvePermissionRoleKey(roles[0] ?? "service_admin", await repository.listPermissionRoles());
            await repository.recordPermissionDenialEvent({
                action: requiredAction,
                actorId,
                at: new Date().toISOString(),
                id: makeAuditId("rbac_denial"),
                immutable: true,
                policyVersionId: activePolicy?.id ?? null,
                reason: "Demo service-admin headers do not include the required action.",
                resource: "service-admin",
                roleKey,
                tenantId: currentTenantId || null,
                traceId: identityTraceId("serviceAdminGuard", "demoPermissionDenied")
            });
            throw new ForbiddenException(`Service-admin permission ${requiredAction} is required for this operation.`);
        }
        request.serviceAdminContext = {
            actor: {
                id: actorId,
                name: actorName
            },
            ...(currentTenantId ? { currentTenantId } : {}),
            permissions,
            ...(roles.length ? { roles } : {})
        };
        return true;
    }
};
ServiceAdminSessionGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector])
], ServiceAdminSessionGuard);
export { ServiceAdminSessionGuard };
function readHeader(request, name) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function readBearerToken(authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return match?.[1]?.trim() ?? "";
}
function resolvePermissionRoleKey(role, permissionRoles) {
    const value = role.trim().toLowerCase();
    const permissionRole = permissionRoles.find((item) => item.key.toLowerCase() === value ||
        item.aliases.some((alias) => alias.toLowerCase() === value));
    return permissionRole?.key ?? null;
}
//# sourceMappingURL=service-admin-session.guard.js.map