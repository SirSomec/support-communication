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
import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ServiceAdminSessionGuard } from "./service-admin-session.guard.js";
import { RequireServiceAdminAction } from "./service-admin-auth.js";
import { updateTenantStatusFromRoute } from "./tenant.route.js";
import { TenantService } from "./tenant.service.js";
let TenantController = class TenantController {
    tenantService;
    constructor(tenantService) {
        this.tenantService = tenantService;
    }
    fetchTenants(filters) {
        return this.tenantService.fetchTenants(filters);
    }
    fetchTenantDetail(tenantId) {
        return this.tenantService.fetchTenantDetail(tenantId);
    }
    updateTenantStatus(tenantId, payload, request) {
        return updateTenantStatusFromRoute(this.tenantService, { ...payload, tenantId }, request);
    }
};
__decorate([
    Get(),
    RequireServiceAdminAction("tenants.read"),
    ApiOkResponse({ description: "Tenant list envelope" }),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "fetchTenants", null);
__decorate([
    Get(":tenantId"),
    RequireServiceAdminAction("tenants.read"),
    ApiOkResponse({ description: "Tenant detail envelope" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "fetchTenantDetail", null);
__decorate([
    Patch(":tenantId/status"),
    RequireServiceAdminAction("tenants.manage"),
    ApiOkResponse({ description: "Tenant status update envelope" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "updateTenantStatus", null);
TenantController = __decorate([
    ApiTags("tenants"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("tenants"),
    __metadata("design:paramtypes", [TenantService])
], TenantController);
export { TenantController };
//# sourceMappingURL=tenant.controller.js.map