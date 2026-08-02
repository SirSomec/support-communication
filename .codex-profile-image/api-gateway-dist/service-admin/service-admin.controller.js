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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { requestServiceAdminBreakGlassApprovalFromRoute, startServiceAdminImpersonationFromRoute } from "./service-admin.route.js";
import { ServiceAdminService } from "./service-admin.service.js";
let ServiceAdminController = class ServiceAdminController {
    serviceAdminService;
    constructor(serviceAdminService) {
        this.serviceAdminService = serviceAdminService;
    }
    fetchSupportUsers(filters) {
        return this.serviceAdminService.fetchSupportUsers(filters);
    }
    resetTwoFactor(userId, payload, request) {
        return this.serviceAdminService.resetTwoFactor({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    resetMfaAlias(userId, payload, request) {
        return this.serviceAdminService.resetTwoFactor({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    forceLogout(userId, payload, request) {
        return this.serviceAdminService.forceLogout({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    forceLogoutAlias(userId, payload, request) {
        return this.serviceAdminService.forceLogout({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    blockUser(userId, payload, request) {
        return this.serviceAdminService.blockUser({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    unblockUser(userId, payload, request) {
        return this.serviceAdminService.unblockUser({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    resendInvite(userId, payload, request) {
        return this.serviceAdminService.resendInvite({ ...payload, actor: request.serviceAdminContext?.actor, userId });
    }
    startImpersonation(payload, request) {
        return startServiceAdminImpersonationFromRoute(this.serviceAdminService, payload, request);
    }
    startImpersonationAlias(payload, request) {
        return startServiceAdminImpersonationFromRoute(this.serviceAdminService, payload, request);
    }
    stopImpersonation(impersonationId, payload, request) {
        return this.serviceAdminService.stopImpersonation({ ...payload, actor: request.serviceAdminContext?.actor, impersonationId });
    }
    requestBreakGlassApproval(payload, request) {
        return requestServiceAdminBreakGlassApprovalFromRoute(this.serviceAdminService, payload, request);
    }
    requestBreakGlassApprovalAlias(payload, request) {
        return requestServiceAdminBreakGlassApprovalFromRoute(this.serviceAdminService, payload, request);
    }
    decideBreakGlassApproval(approvalId, payload, request) {
        return this.serviceAdminService.decideBreakGlassApproval({ ...payload, actor: request.serviceAdminContext?.actor, approvalId });
    }
    decideBreakGlassApprovalAlias(approvalId, payload, request) {
        return this.serviceAdminService.decideBreakGlassApproval({ ...payload, actor: request.serviceAdminContext?.actor, approvalId });
    }
    fetchAuditEvents(filters) {
        return this.serviceAdminService.fetchAuditEvents(filters);
    }
    requestAuditExport(payload, request) {
        return this.serviceAdminService.requestAuditExport(payload, request.serviceAdminContext?.actor);
    }
    redactAuditEvent(eventId, payload, request) {
        return this.serviceAdminService.redactAuditEvent({
            ...payload,
            actor: request.serviceAdminContext?.actor,
            eventId
        });
    }
};
__decorate([
    Get("users"),
    RequireServiceAdminAction("service-admin.users.read"),
    ApiOkResponse({ description: "Service-admin user support workspace envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "fetchSupportUsers", null);
__decorate([
    Post("users/:userId/2fa-reset"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin MFA reset envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "resetTwoFactor", null);
__decorate([
    Post("users/:userId/mfa/reset"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin MFA reset envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "resetMfaAlias", null);
__decorate([
    Post("users/:userId/force-logout"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin forced logout envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "forceLogout", null);
__decorate([
    Post("users/:userId/sessions/logout"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin forced logout envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "forceLogoutAlias", null);
__decorate([
    Post("users/:userId/block"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin user block envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "blockUser", null);
__decorate([
    Post("users/:userId/unblock"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin user unblock envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "unblockUser", null);
__decorate([
    Post("users/:userId/invite/resend"),
    RequireServiceAdminAction("service-admin.users.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin invite resend envelope" }),
    __param(0, Param("userId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "resendInvite", null);
__decorate([
    Post("impersonations/start"),
    RequireServiceAdminAction("impersonation.start"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin impersonation start envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "startImpersonation", null);
__decorate([
    Post("impersonations"),
    RequireServiceAdminAction("impersonation.start"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin impersonation start envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "startImpersonationAlias", null);
__decorate([
    Post("impersonations/:impersonationId/stop"),
    RequireServiceAdminAction("impersonation.stop"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Impersonation stop envelope" }),
    __param(0, Param("impersonationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "stopImpersonation", null);
__decorate([
    Post("break-glass/approvals"),
    RequireServiceAdminAction("break-glass.request"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Break-glass approval request envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "requestBreakGlassApproval", null);
__decorate([
    Post("break-glass-approvals"),
    RequireServiceAdminAction("break-glass.request"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Break-glass approval request envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "requestBreakGlassApprovalAlias", null);
__decorate([
    Post("break-glass/approvals/:approvalId/decision"),
    RequireServiceAdminAction("break-glass.decide"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Break-glass approval decision envelope" }),
    __param(0, Param("approvalId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "decideBreakGlassApproval", null);
__decorate([
    Post("break-glass-approvals/:approvalId/decision"),
    RequireServiceAdminAction("break-glass.decide"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Break-glass approval decision envelope" }),
    __param(0, Param("approvalId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "decideBreakGlassApprovalAlias", null);
__decorate([
    Get("audit-events"),
    RequireServiceAdminAction("service-admin.audit.read"),
    ApiOkResponse({ description: "Service-admin audit event search envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "fetchAuditEvents", null);
__decorate([
    Post("audit-events/exports"),
    RequireServiceAdminAction("service-admin.audit.export"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin audit export envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "requestAuditExport", null);
__decorate([
    Post("audit-events/:eventId/redactions"),
    RequireServiceAdminAction("service-admin.audit.redact"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Service-admin audit redaction envelope" }),
    __param(0, Param("eventId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ServiceAdminController.prototype, "redactAuditEvent", null);
ServiceAdminController = __decorate([
    ApiTags("service-admin"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("service-admin"),
    __metadata("design:paramtypes", [ServiceAdminService])
], ServiceAdminController);
export { ServiceAdminController };
//# sourceMappingURL=service-admin.controller.js.map