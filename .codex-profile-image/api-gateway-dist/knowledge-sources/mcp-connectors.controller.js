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
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { McpConnectorsService } from "./mcp-connectors.service.js";
let McpConnectorsController = class McpConnectorsController {
    service;
    constructor(service) {
        this.service = service;
    }
    list(tenantId) { return this.service.list(tenantId); }
    create(tenantId, body, request) { return this.service.create(tenantId, body ?? {}, actor(request)); }
    update(tenantId, id, body, request) { return this.service.update(tenantId, id, body ?? {}, actor(request)); }
    approve(tenantId, id, request) { return this.service.approve(tenantId, id, actor(request)); }
    enable(tenantId, id, request) { return this.service.setEnabled(tenantId, id, true, actor(request)); }
    disable(tenantId, id, request) { return this.service.setEnabled(tenantId, id, false, actor(request)); }
};
__decorate([
    Get(),
    RequireServiceAdminAction("knowledge.sources.write"),
    ApiOkResponse({ description: "Tenant MCP connector metadata; no credentials or headers" }),
    __param(0, Param("tenantId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "list", null);
__decorate([
    Post(),
    RequireServiceAdminAction("knowledge.sources.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("tenantId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "create", null);
__decorate([
    Patch(":connectorId"),
    RequireServiceAdminAction("knowledge.sources.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("tenantId")),
    __param(1, Param("connectorId")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "update", null);
__decorate([
    Post(":connectorId/approve"),
    RequireServiceAdminAction("knowledge.sources.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("tenantId")),
    __param(1, Param("connectorId")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "approve", null);
__decorate([
    Post(":connectorId/enable"),
    RequireServiceAdminAction("knowledge.sources.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("tenantId")),
    __param(1, Param("connectorId")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "enable", null);
__decorate([
    Post(":connectorId/disable"),
    RequireServiceAdminAction("knowledge.sources.write"),
    HttpCode(HttpStatus.OK),
    __param(0, Param("tenantId")),
    __param(1, Param("connectorId")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], McpConnectorsController.prototype, "disable", null);
McpConnectorsController = __decorate([
    ApiTags("service-admin", "mcp-connectors"),
    UseGuards(ServiceAdminSessionGuard),
    Controller("service-admin/tenants/:tenantId/mcp-connectors"),
    __metadata("design:paramtypes", [McpConnectorsService])
], McpConnectorsController);
export { McpConnectorsController };
function actor(request) { return request.serviceAdminContext?.actor ?? { id: "service-admin", name: "Service Admin" }; }
//# sourceMappingURL=mcp-connectors.controller.js.map