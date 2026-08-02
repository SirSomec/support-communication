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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { AiConnectionsService } from "./ai-connections.service.js";
let AiConnectionsController = class AiConnectionsController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(tenantId) { return this.service.list(tenantId); }
    create(tenantId, body) { return this.service.create(tenantId, body ?? {}); }
    update(tenantId, connectionId, body) { return this.service.update(tenantId, connectionId, body ?? {}); }
    rotate(tenantId, connectionId, body) { return this.service.rotate(tenantId, connectionId, body ?? {}); }
    test(tenantId, connectionId) { return this.service.test(tenantId, connectionId); }
    disable(tenantId, connectionId) { return this.service.disable(tenantId, connectionId); }
    remove(tenantId, connectionId) { return this.service.remove(tenantId, connectionId); }
};
__decorate([
    Get(),
    RequireServiceAdminAction("ai.connections.manage"),
    ApiOkResponse({ description: "Tenant AI connection metadata without secrets" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "list", null);
__decorate([
    Post(),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Create tenant AI connection without returning secret" }),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "create", null);
__decorate([
    Patch(":connectionId"),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Update or rotate tenant AI connection secret" }),
    __param(0, Param("tenantId")),
    __param(1, Param("connectionId")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "update", null);
__decorate([
    Post(":connectionId/rotate"),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Rotate tenant AI connection secret without returning it" }),
    __param(0, Param("tenantId")),
    __param(1, Param("connectionId")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "rotate", null);
__decorate([
    Post(":connectionId/test"),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Run minimal provider connectivity check without customer data" }),
    __param(0, Param("tenantId")),
    __param(1, Param("connectionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "test", null);
__decorate([
    Post(":connectionId/disable"),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Disable tenant AI connection" }),
    __param(0, Param("tenantId")),
    __param(1, Param("connectionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "disable", null);
__decorate([
    Delete(":connectionId"),
    RequireServiceAdminAction("ai.connections.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Delete tenant AI connection and encrypted secret" }),
    __param(0, Param("tenantId")),
    __param(1, Param("connectionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AiConnectionsController.prototype, "remove", null);
AiConnectionsController = __decorate([
    ApiTags("service-admin", "ai-connections"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("service-admin/tenants/:tenantId/ai-connections"),
    __metadata("design:paramtypes", [AiConnectionsService])
], AiConnectionsController);
export { AiConnectionsController };
//# sourceMappingURL=ai-connections.controller.js.map