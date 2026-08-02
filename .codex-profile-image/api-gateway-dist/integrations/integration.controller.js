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
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { IntegrationService } from "./integration.service.js";
let IntegrationController = class IntegrationController {
    integrationService;
    constructor(integrationService) {
        this.integrationService = integrationService;
    }
    fetchIntegrationWorkspace() {
        return this.integrationService.fetchIntegrationWorkspace();
    }
    fetchIntegrationCapabilities() {
        return this.integrationService.fetchIntegrationCapabilities();
    }
    fetchChannelConnections(request, query) {
        return this.integrationService.fetchChannelConnections(request.tenantOperatorContext?.tenantId ?? "", query);
    }
    createChannelConnection(request, payload) {
        return this.integrationService.createChannelConnection(request.tenantOperatorContext?.tenantId ?? "", payload);
    }
    updateChannelTypeStatus(request, type, payload) {
        return this.integrationService.updateChannelTypeStatus(request.tenantOperatorContext?.tenantId ?? "", type, payload);
    }
    updateChannelConnection(request, connectionId, payload) {
        return this.integrationService.updateChannelConnection(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
    }
    deleteChannelConnection(request, connectionId, payload = {}) {
        return this.integrationService.deleteChannelConnection(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
    }
    testChannelConnectionInstance(request, connectionId, payload) {
        return this.integrationService.testChannelConnectionInstance(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
    }
    fetchChannelConnectionEvents(request, connectionId) {
        return this.integrationService.fetchChannelConnectionEvents(request.tenantOperatorContext?.tenantId ?? "", connectionId);
    }
    testChannelConnection(payload) {
        return this.integrationService.testChannelConnection(payload);
    }
    createPublicApiKey(payload = {}) {
        return this.integrationService.createPublicApiKey(payload);
    }
    rotateApiKey(keyId) {
        return this.integrationService.rotateApiKey(keyId);
    }
    revokePublicApiKey(keyId) {
        return this.integrationService.revokePublicApiKey(keyId);
    }
    createWebhookEndpoint(payload = {}) {
        return this.integrationService.createWebhookEndpoint(payload);
    }
    updateWebhookEndpoint(endpointId, payload = {}) {
        return this.integrationService.updateWebhookEndpoint(endpointId, payload);
    }
    deleteWebhookEndpoint(endpointId) {
        return this.integrationService.deleteWebhookEndpoint(endpointId);
    }
    replayWebhookDelivery(deliveryId, payload = {}) {
        return this.integrationService.replayWebhookDelivery({ deliveryId, idempotencyKey: payload.idempotencyKey });
    }
    revokeSecuritySession(sessionId) {
        return this.integrationService.revokeSecuritySession(sessionId);
    }
    fetchTelegramConnection(request) {
        return this.integrationService.fetchTelegramConnection(request.tenantOperatorContext?.tenantId ?? "");
    }
    saveTelegramConnection(request, payload) {
        return this.integrationService.saveTelegramConnection(request.tenantOperatorContext?.tenantId ?? "", payload);
    }
    disconnectTelegramConnection(request) {
        return this.integrationService.disconnectTelegramConnection(request.tenantOperatorContext?.tenantId ?? "");
    }
};
__decorate([
    Get("workspace"),
    ApiOperation({
        operationId: "listIntegrationWorkspace",
        summary: "List integration workspace with masked public API key metadata"
    }),
    ApiOkResponse({ description: "Channel, masked public API key metadata, webhook and security workspace envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "fetchIntegrationWorkspace", null);
__decorate([
    Get("capabilities"),
    ApiOperation({
        operationId: "fetchIntegrationCapabilities",
        summary: "List backend integration capability snapshot for settings diagnostics"
    }),
    ApiOkResponse({ description: "Backend integration capability envelope" }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "fetchIntegrationCapabilities", null);
__decorate([
    Get("channels"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.read"),
    ApiOperation({
        operationId: "listChannelConnections",
        summary: "List tenant channel connection instances"
    }),
    ApiOkResponse({ description: "Channel connection instances envelope" }),
    __param(0, Req()),
    __param(1, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "fetchChannelConnections", null);
__decorate([
    Post("channels"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "createChannelConnection",
        summary: "Create a tenant channel connection instance"
    }),
    ApiOkResponse({ description: "Created channel connection envelope with masked credentials" }),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "createChannelConnection", null);
__decorate([
    Patch("channels/types/:type/status"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "updateChannelTypeStatus",
        summary: "Enable or disable every tenant connection of one channel type"
    }),
    ApiParam({ name: "type", description: "Channel type, for example telegram, sdk, vk or max" }),
    ApiOkResponse({ description: "Updated aggregate channel status envelope with immutable audit evidence" }),
    __param(0, Req()),
    __param(1, Param("type")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "updateChannelTypeStatus", null);
__decorate([
    Patch("channels/:connectionId"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "updateChannelConnection",
        summary: "Update a tenant channel connection instance"
    }),
    ApiParam({ name: "connectionId", description: "Channel connection identifier" }),
    ApiOkResponse({ description: "Updated channel connection envelope with masked credentials" }),
    __param(0, Req()),
    __param(1, Param("connectionId")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "updateChannelConnection", null);
__decorate([
    Delete("channels/:connectionId"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "deleteChannelConnection",
        summary: "Permanently delete a tenant channel connection instance"
    }),
    ApiParam({ name: "connectionId", description: "Channel connection identifier" }),
    ApiOkResponse({ description: "Deleted channel connection envelope" }),
    __param(0, Req()),
    __param(1, Param("connectionId")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "deleteChannelConnection", null);
__decorate([
    Post("channels/:connectionId/test"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "testChannelConnectionInstance",
        summary: "Queue a receive/send test for a concrete channel connection"
    }),
    ApiParam({ name: "connectionId", description: "Channel connection identifier" }),
    ApiOkResponse({ description: "Queued channel connection test envelope" }),
    __param(0, Req()),
    __param(1, Param("connectionId")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "testChannelConnectionInstance", null);
__decorate([
    Get("channels/:connectionId/events"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.read"),
    ApiOperation({
        operationId: "listChannelConnectionEvents",
        summary: "List channel connection audit and health events"
    }),
    ApiParam({ name: "connectionId", description: "Channel connection identifier" }),
    ApiOkResponse({ description: "Channel connection events envelope" }),
    __param(0, Req()),
    __param(1, Param("connectionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "fetchChannelConnectionEvents", null);
__decorate([
    Post("channel-tests"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Queued channel test envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "testChannelConnection", null);
__decorate([
    Post("api-keys"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Creates a public API key; the raw secret is returned exactly once in this response and only its hash is stored.",
        operationId: "createPublicApiKey",
        summary: "Create a public API key"
    }),
    ApiBody({
        schema: {
            properties: {
                environment: { enum: ["production", "stage"], type: "string" },
                name: { type: "string" },
                scopes: { items: { type: "string" }, type: "array" }
            },
            required: ["name"],
            type: "object"
        }
    }),
    ApiOkResponse({ description: "Created API key envelope; the raw secret appears only in this one-time response" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "createPublicApiKey", null);
__decorate([
    Post("api-keys/:keyId/rotate"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Queues public API key rotation; raw key material is never returned in the response.",
        operationId: "rotatePublicApiKey",
        summary: "Rotate a public API key"
    }),
    ApiParam({ name: "keyId", description: "Public API key identifier to rotate" }),
    ApiOkResponse({ description: "Queued API key rotation envelope; raw key material is never returned" }),
    __param(0, Param("keyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "rotateApiKey", null);
__decorate([
    Post("api-keys/:keyId/revoke"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Revokes a public API key immediately; revoked keys stop authenticating public API requests.",
        operationId: "revokePublicApiKey",
        summary: "Revoke a public API key"
    }),
    ApiParam({ name: "keyId", description: "Public API key identifier to revoke" }),
    ApiOkResponse({ description: "Revoked API key envelope with immutable audit evidence" }),
    __param(0, Param("keyId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "revokePublicApiKey", null);
__decorate([
    Post("webhooks/endpoints"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "createWebhookEndpoint",
        summary: "Create a signed webhook endpoint"
    }),
    ApiBody({
        schema: {
            properties: {
                channel: { type: "string" },
                name: { type: "string" },
                url: { type: "string" }
            },
            required: ["name", "url"],
            type: "object"
        }
    }),
    ApiOkResponse({ description: "Created webhook endpoint envelope" }),
    __param(0, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "createWebhookEndpoint", null);
__decorate([
    Patch("webhooks/endpoints/:endpointId"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "updateWebhookEndpoint",
        summary: "Update or enable/disable a signed webhook endpoint"
    }),
    ApiParam({ name: "endpointId", description: "Webhook endpoint identifier" }),
    ApiBody({
        required: false,
        schema: {
            properties: {
                name: { type: "string" },
                status: { enum: ["active", "disabled"], type: "string" },
                url: { type: "string" }
            },
            type: "object"
        }
    }),
    ApiOkResponse({ description: "Updated webhook endpoint envelope" }),
    __param(0, Param("endpointId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "updateWebhookEndpoint", null);
__decorate([
    Delete("webhooks/endpoints/:endpointId"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "deleteWebhookEndpoint",
        summary: "Delete a signed webhook endpoint"
    }),
    ApiParam({ name: "endpointId", description: "Webhook endpoint identifier" }),
    ApiOkResponse({ description: "Deleted webhook endpoint envelope" }),
    __param(0, Param("endpointId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "deleteWebhookEndpoint", null);
__decorate([
    Post("webhooks/deliveries/:deliveryId/replay"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Signed webhook delivery replay endpoint; original trace id is preserved and duplicate idempotency keys return the original replay descriptor.",
        operationId: "replaySignedWebhookDelivery",
        summary: "Replay a signed webhook delivery"
    }),
    ApiParam({ name: "deliveryId", description: "Webhook delivery identifier to replay" }),
    ApiBody({
        required: false,
        schema: {
            properties: {
                idempotencyKey: { type: "string" }
            },
            type: "object"
        }
    }),
    ApiOkResponse({ description: "Queued webhook replay envelope; original trace id is preserved" }),
    __param(0, Param("deliveryId")),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "replayWebhookDelivery", null);
__decorate([
    Post("security/sessions/:sessionId/revoke"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    RequireTenantOperatorPermission("settings.manage"),
    RequireServiceAdminAction("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Security session revoke envelope" }),
    __param(0, Param("sessionId")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "revokeSecuritySession", null);
__decorate([
    Get("channels/telegram"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.read"),
    ApiOperation({
        operationId: "fetchTelegramConnection",
        summary: "Read tenant Telegram bot connection settings"
    }),
    ApiOkResponse({ description: "Masked Telegram connection envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "fetchTelegramConnection", null);
__decorate([
    Post("channels/telegram"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "saveTelegramConnection",
        summary: "Save tenant Telegram bot token and webhook secret"
    }),
    ApiBody({
        schema: {
            properties: {
                botToken: { type: "string" }
            },
            required: ["botToken"],
            type: "object"
        }
    }),
    ApiOkResponse({ description: "Saved Telegram connection envelope" }),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "saveTelegramConnection", null);
__decorate([
    Delete("channels/telegram"),
    UseGuards(TenantOperatorAuthGuard),
    RequireTenantOperatorPermission("settings.manage"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        operationId: "disconnectTelegramConnection",
        summary: "Disable tenant Telegram bot connection"
    }),
    ApiOkResponse({ description: "Disconnected Telegram connection envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], IntegrationController.prototype, "disconnectTelegramConnection", null);
IntegrationController = __decorate([
    ApiTags("integrations"),
    ApiBearerAuth(),
    Controller("integrations"),
    __metadata("design:paramtypes", [IntegrationService])
], IntegrationController);
export { IntegrationController };
//# sourceMappingURL=integration.controller.js.map