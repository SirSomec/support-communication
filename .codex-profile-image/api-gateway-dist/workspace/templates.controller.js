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
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { WorkspaceService } from "./workspace.service.js";
let TemplatesController = class TemplatesController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    fetchTemplates(filters, request) {
        return this.workspaceService.fetchTemplates(filters, tenantContextFromServiceAdminRequest(request));
    }
    saveTemplate(payload, request) {
        return this.workspaceService.saveTemplate(payload, tenantContextFromServiceAdminRequest(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("templates.read"),
    RequireServiceAdminAction("templates.read"),
    ApiOkResponse({ description: "Template library envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TemplatesController.prototype, "fetchTemplates", null);
__decorate([
    Post(),
    RequireTenantOperatorPermission("templates.write"),
    RequireServiceAdminAction("templates.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Saved template envelope with version and audit metadata" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], TemplatesController.prototype, "saveTemplate", null);
TemplatesController = __decorate([
    ApiTags("templates"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("templates"),
    __metadata("design:paramtypes", [WorkspaceService])
], TemplatesController);
export { TemplatesController };
function tenantContextFromServiceAdminRequest(request) {
    if (request.tenantOperatorContext?.tenantId) {
        return {
            operatorId: request.tenantOperatorContext.userId,
            permissions: request.tenantOperatorContext.permissions,
            tenantId: request.tenantOperatorContext.tenantId
        };
    }
    // Service-admin работает с библиотекой тенанта целиком, включая личные шаблоны.
    return request.serviceAdminContext?.currentTenantId
        ? { permissions: ["*"], tenantId: request.serviceAdminContext.currentTenantId }
        : {};
}
//# sourceMappingURL=templates.controller.js.map