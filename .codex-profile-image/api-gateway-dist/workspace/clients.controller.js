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
let ClientsController = class ClientsController {
    workspaceService;
    constructor(workspaceService) {
        this.workspaceService = workspaceService;
    }
    fetchClientProfiles(filters, request) {
        return this.workspaceService.fetchClientProfiles(filters, tenantContextFromRequest(request));
    }
    fetchClientSegments(request) {
        return this.workspaceService.fetchClientSegments(tenantContextFromRequest(request));
    }
    createClientExport(payload, request) {
        return this.workspaceService.createClientExport(payload, tenantContextFromRequest(request));
    }
    mergeClientProfiles(payload, request) {
        return this.workspaceService.mergeClientProfiles(payload, tenantContextFromRequest(request));
    }
    unmergeClientProfile(payload, request) {
        return this.workspaceService.unmergeClientProfile(payload, tenantContextFromRequest(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("clients.read"),
    RequireServiceAdminAction("clients.read"),
    ApiOkResponse({ description: "Client profile list envelope with merge graph" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "fetchClientProfiles", null);
__decorate([
    Get("segments"),
    RequireTenantOperatorPermission("clients.read"),
    RequireServiceAdminAction("clients.read"),
    ApiOkResponse({ description: "Client segment descriptor envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "fetchClientSegments", null);
__decorate([
    Post("exports"),
    RequireTenantOperatorPermission("clients.read"),
    RequireServiceAdminAction("clients.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Client export job descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "createClientExport", null);
__decorate([
    Post("merge"),
    RequireTenantOperatorPermission("clients.merge"),
    RequireServiceAdminAction("clients.merge"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Client merge audit descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "mergeClientProfiles", null);
__decorate([
    Post("unmerge"),
    RequireTenantOperatorPermission("clients.merge"),
    RequireServiceAdminAction("clients.merge"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Client unmerge audit descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "unmergeClientProfile", null);
ClientsController = __decorate([
    ApiTags("clients"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("clients"),
    __metadata("design:paramtypes", [WorkspaceService])
], ClientsController);
export { ClientsController };
function tenantContextFromRequest(request) {
    if (request.tenantOperatorContext?.tenantId) {
        return { tenantId: request.tenantOperatorContext.tenantId };
    }
    return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
//# sourceMappingURL=clients.controller.js.map