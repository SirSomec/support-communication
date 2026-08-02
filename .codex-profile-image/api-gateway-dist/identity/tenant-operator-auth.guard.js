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
import { IdentityRepository } from "./identity.repository.js";
import { TENANT_OPERATOR_PERMISSION_KEY, readBearerTokenFromAuthorization } from "./tenant-operator-auth.js";
let TenantOperatorAuthGuard = class TenantOperatorAuthGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const requiredAction = this.reflector.getAllAndOverride(TENANT_OPERATOR_PERMISSION_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        const authorization = readHeader(request, "authorization");
        const bearerToken = readBearerTokenFromAuthorization(authorization);
        if (!bearerToken) {
            throw new UnauthorizedException("Bearer tenant operator session is required.");
        }
        const repository = IdentityRepository.default();
        const resolved = await repository.findTenantOperatorSessionByAccessToken(bearerToken);
        if (!resolved) {
            throw new UnauthorizedException("Tenant operator session is invalid or expired.");
        }
        if (requiredAction && !hasPermission(resolved.permissions, requiredAction)) {
            throw new ForbiddenException(`Tenant operator permission ${requiredAction} is required.`);
        }
        try {
            await repository.touchServiceAdminSessionActivity({ accessToken: bearerToken });
        }
        catch {
            // Продление сессии best-effort: сбой записи не должен валить авторизованный запрос.
        }
        request.tenantOperatorContext = {
            permissions: resolved.permissions,
            sessionId: resolved.session.id,
            tenantId: resolved.session.tenantId,
            userId: resolved.session.userId
        };
        return true;
    }
};
TenantOperatorAuthGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector])
], TenantOperatorAuthGuard);
export { TenantOperatorAuthGuard };
function readHeader(request, name) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
function hasPermission(permissions, requiredAction) {
    return permissions.includes("*") || permissions.includes(requiredAction);
}
//# sourceMappingURL=tenant-operator-auth.guard.js.map