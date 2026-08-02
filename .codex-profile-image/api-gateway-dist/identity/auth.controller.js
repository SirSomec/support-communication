var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { ServiceAdminSessionGuard } from "./service-admin-session.guard.js";
import { RequireServiceAdminAction } from "./service-admin-auth.js";
import { TenantOperatorAuthGuard } from "./tenant-operator-auth.guard.js";
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    getAuthState(request) {
        return this.authService.getAuthState({ sessionId: request.serviceAdminContext?.sessionId });
    }
    login(payload) {
        return this.authService.login(payload);
    }
    tenantLogin(payload) {
        return this.authService.loginTenantOperator(payload);
    }
    tenantState(request) {
        return this.authService.getTenantOperatorState({ sessionId: request.tenantOperatorContext?.sessionId });
    }
    tenantLogout(request) {
        return this.authService.logoutTenantOperator({
            sessionId: request.tenantOperatorContext?.sessionId,
            tenantId: request.tenantOperatorContext?.tenantId,
            userId: request.tenantOperatorContext?.userId
        });
    }
    selectTenant(payload, request) {
        return this.authService.selectTenant({
            tenantId: payload.tenantId,
            userId: request.tenantOperatorContext?.userId
        });
    }
    acceptInvite(payload) {
        return this.authService.acceptInvite(payload);
    }
    requestRecovery(payload) {
        return this.authService.requestRecovery(payload);
    }
    completeRecovery(payload) {
        return this.authService.completeRecovery(payload);
    }
    startOidcLogin(payload) {
        return this.authService.startOidcLogin(payload);
    }
    completeOidcCallback(query) {
        return this.authService.completeOidcCallback({
            code: query.code,
            error: query.error,
            errorDescription: query.error_description,
            state: query.state
        });
    }
    completeSamlAcs(payload) {
        return this.authService.completeSamlAcs(payload);
    }
    logout(payload = {}, request) {
        return this.authService.logout({ ...payload, sessionId: request.serviceAdminContext?.sessionId });
    }
};
__decorate([
    Get("state"),
    UseGuards(ServiceAdminSessionGuard),
    RequireServiceAdminAction("auth.state"),
    ApiOkResponse({ description: "Current authentication state envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getAuthState", null);
__decorate([
    Post("login"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Password and MFA login envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    Post("tenant/login"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Tenant operator login envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "tenantLogin", null);
__decorate([
    Get("tenant/state"),
    UseGuards(TenantOperatorAuthGuard),
    ApiOkResponse({ description: "Tenant operator auth state envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "tenantState", null);
__decorate([
    Post("tenant/logout"),
    HttpCode(HttpStatus.OK),
    UseGuards(TenantOperatorAuthGuard),
    ApiOkResponse({ description: "Tenant operator logout envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "tenantLogout", null);
__decorate([
    Post("tenant/select"),
    HttpCode(HttpStatus.OK),
    UseGuards(TenantOperatorAuthGuard),
    ApiOkResponse({ description: "Tenant membership selection envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "selectTenant", null);
__decorate([
    Post("invites/accept"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Invite acceptance envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "acceptInvite", null);
__decorate([
    Post("recovery/request"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Password recovery request envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestRecovery", null);
__decorate([
    Post("recovery/complete"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Password recovery completion envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "completeRecovery", null);
__decorate([
    Post("oidc/start"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "OIDC authorization redirect envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "startOidcLogin", null);
__decorate([
    Get("oidc/callback"),
    ApiOkResponse({ description: "OIDC callback descriptor validation envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "completeOidcCallback", null);
__decorate([
    Post("saml/acs"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "SAML ACS assertion validation envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "completeSamlAcs", null);
__decorate([
    Post("logout"),
    HttpCode(HttpStatus.OK),
    UseGuards(ServiceAdminSessionGuard),
    RequireServiceAdminAction("auth.logout"),
    ApiOkResponse({ description: "Logout envelope with auth audit metadata" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
AuthController = __decorate([
    ApiTags("auth"),
    Controller("auth"),
    __metadata("design:paramtypes", [AuthService])
], AuthController);
export { AuthController };
//# sourceMappingURL=auth.controller.js.map