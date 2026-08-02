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
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { createEnvelope } from "@support-communication/envelope";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
import { McpConnectorsService } from "./mcp-connectors.service.js";
/**
 * BAI-831: раздел «Знания» тенанта видит свои MCP-подключения и подаёт заявку.
 * Одобрение и включение остаются за Service Admin (mcp-connectors.controller).
 * Секреты/заголовки не возвращаются — только метаданные.
 */
// Namespace deliberately outside "knowledge/…": the workspace article controller
// owns the greedy "knowledge/:articleId" route and would otherwise shadow these.
let TenantMcpConnectorsController = class TenantMcpConnectorsController {
    service;
    constructor(service) {
        this.service = service;
    }
    async list(request) {
        const tenantId = resolveTenant(request);
        return createEnvelope({
            data: { connectors: await McpConnectorRepository.default().list(tenantId) },
            meta: { apiVersion: "v1", tenantId },
            operation: "listTenantMcpConnectors",
            service: "tenantMcpConnectorsService",
            traceId: `trc_tenant_mcp_${Date.now()}`
        });
    }
    request(body, request) {
        const tenantId = resolveTenant(request);
        const requestedBy = request.tenantOperatorContext?.userId ?? request.serviceAdminContext?.actor?.id ?? "tenant-admin";
        return this.service.request(tenantId, body ?? {}, requestedBy);
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("knowledge.read"),
    RequireServiceAdminAction("knowledge.read"),
    ApiOkResponse({ description: "Tenant MCP connectors with approval status; no credentials" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TenantMcpConnectorsController.prototype, "list", null);
__decorate([
    Post("requests"),
    RequireTenantOperatorPermission("knowledge.write"),
    RequireServiceAdminAction("knowledge.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Submit an MCP connector request for service-admin approval" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TenantMcpConnectorsController.prototype, "request", null);
TenantMcpConnectorsController = __decorate([
    ApiTags("knowledge-mcp-connectors"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("knowledge-mcp-connectors"),
    __metadata("design:paramtypes", [McpConnectorsService])
], TenantMcpConnectorsController);
export { TenantMcpConnectorsController };
function resolveTenant(request) {
    return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}
//# sourceMappingURL=tenant-mcp-connectors.controller.js.map