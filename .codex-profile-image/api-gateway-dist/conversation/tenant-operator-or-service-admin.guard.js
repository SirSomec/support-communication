var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { readBearerTokenFromAuthorization } from "../identity/tenant-operator-auth.js";
let TenantOperatorOrServiceAdminGuard = class TenantOperatorOrServiceAdminGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const bearerToken = resolveBearerTokenForRequest(context, request);
        if (bearerToken) {
            request.headers.authorization = `Bearer ${bearerToken}`;
            try {
                return await new TenantOperatorAuthGuard(this.reflector).canActivate(context);
            }
            catch (error) {
                if (error instanceof ForbiddenException) {
                    throw error;
                }
            }
        }
        return new ServiceAdminSessionGuard(this.reflector).canActivate(context);
    }
};
TenantOperatorOrServiceAdminGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector])
], TenantOperatorOrServiceAdminGuard);
export { TenantOperatorOrServiceAdminGuard };
function resolveBearerTokenForRequest(context, request) {
    const authorization = readHeader(request, "authorization");
    const bearerToken = readBearerTokenFromAuthorization(authorization);
    if (bearerToken) {
        return bearerToken;
    }
    if (!isRealtimeSseRoute(request) || !isRealtimeSseQueryTokenEnabled()) {
        return "";
    }
    // Staging-only fallback: EventSource cannot set Authorization headers.
    return readQueryAccessToken(request.query);
}
function isRealtimeSseRoute(request) {
    const routePath = request.route?.path ?? "";
    if (routePath === "events/stream") {
        return true;
    }
    return String(request.url ?? "").includes("/realtime/events/stream");
}
function isRealtimeSseQueryTokenEnabled() {
    // PILOT_SSE_QUERY_TOKEN — устаревшее имя, поддерживается один релиз.
    const configured = process.env.REALTIME_SSE_QUERY_TOKEN ?? process.env.PILOT_SSE_QUERY_TOKEN;
    return String(configured ?? "").trim().toLowerCase() === "true";
}
function readQueryAccessToken(query) {
    if (!query) {
        return "";
    }
    const raw = query.accessToken;
    return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}
function readHeader(request, name) {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
//# sourceMappingURL=tenant-operator-or-service-admin.guard.js.map