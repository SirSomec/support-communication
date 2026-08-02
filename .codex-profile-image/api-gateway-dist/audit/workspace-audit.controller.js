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
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { WorkspaceAuditService } from "./workspace-audit.service.js";
let WorkspaceAuditController = class WorkspaceAuditController {
    workspaceAuditService;
    constructor(workspaceAuditService) {
        this.workspaceAuditService = workspaceAuditService;
    }
    fetchWorkspaceAuditEvents(filters, request) {
        return this.workspaceAuditService.fetchWorkspaceAuditEvents(filters, auditContextFromRequest(request));
    }
};
__decorate([
    Get("events"),
    RequireTenantOperatorPermission("audit.read"),
    RequireServiceAdminAction("audit.read"),
    ApiOkResponse({ description: "Tenant workspace audit events envelope" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceAuditController.prototype, "fetchWorkspaceAuditEvents", null);
WorkspaceAuditController = __decorate([
    ApiTags("audit"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("audit"),
    __metadata("design:paramtypes", [WorkspaceAuditService])
], WorkspaceAuditController);
export { WorkspaceAuditController };
function auditContextFromRequest(request) {
    const serviceAdminContext = request.serviceAdminContext;
    const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
    if (!tenantId) {
        return {};
    }
    return {
        actorId: request.tenantOperatorContext?.userId ?? serviceAdminContext?.actor.id,
        tenantId
    };
}
//# sourceMappingURL=workspace-audit.controller.js.map