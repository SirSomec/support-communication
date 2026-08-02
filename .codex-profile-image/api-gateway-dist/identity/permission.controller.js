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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { PermissionService } from "./permission.service.js";
let PermissionController = class PermissionController {
    permissionService;
    constructor(permissionService) {
        this.permissionService = permissionService;
    }
    validatePermission(payload) {
        return this.permissionService.validatePermission(payload);
    }
    fetchPermissionModel() {
        return this.permissionService.fetchPermissionModel();
    }
};
__decorate([
    Post("validate"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("permissions.validate"),
    RequireServiceAdminAction("permissions.validate"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Server-side permission decision envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PermissionController.prototype, "validatePermission", null);
__decorate([
    Get("model"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("permissions.read"),
    RequireServiceAdminAction("permissions.read"),
    ApiOkResponse({ description: "Permission model envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PermissionController.prototype, "fetchPermissionModel", null);
PermissionController = __decorate([
    ApiTags("permissions"),
    Controller("permissions"),
    __metadata("design:paramtypes", [PermissionService])
], PermissionController);
export { PermissionController };
//# sourceMappingURL=permission.controller.js.map