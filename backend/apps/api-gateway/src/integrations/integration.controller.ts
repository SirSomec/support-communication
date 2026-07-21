import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { IntegrationService } from "./integration.service.js";

@ApiTags("integrations")
@ApiBearerAuth()
@Controller("integrations")
export class IntegrationController {
  constructor(private readonly integrationService: IntegrationService) {}

  @Get("workspace")
  @ApiOperation({
    operationId: "listIntegrationWorkspace",
    summary: "List integration workspace with masked public API key metadata"
  })
  @ApiOkResponse({ description: "Channel, masked public API key metadata, webhook and security workspace envelope" })
  fetchIntegrationWorkspace() {
    return this.integrationService.fetchIntegrationWorkspace();
  }

  @Get("capabilities")
  @ApiOperation({
    operationId: "fetchIntegrationCapabilities",
    summary: "List backend integration capability snapshot for settings diagnostics"
  })
  @ApiOkResponse({ description: "Backend integration capability envelope" })
  fetchIntegrationCapabilities() {
    return this.integrationService.fetchIntegrationCapabilities();
  }

  @Get("channels")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({
    operationId: "listChannelConnections",
    summary: "List tenant channel connection instances"
  })
  @ApiOkResponse({ description: "Channel connection instances envelope" })
  fetchChannelConnections(@Req() request: TenantOperatorRequest, @Query() query: { type?: string }) {
    return this.integrationService.fetchChannelConnections(request.tenantOperatorContext?.tenantId ?? "", query);
  }

  @Post("channels")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "createChannelConnection",
    summary: "Create a tenant channel connection instance"
  })
  @ApiOkResponse({ description: "Created channel connection envelope with masked credentials" })
  createChannelConnection(
    @Req() request: TenantOperatorRequest,
    @Body() payload: {
      chatLimit?: number;
      credentials?: Record<string, unknown>;
      environment?: string;
      name?: string;
      routingQueueId?: string;
      status?: string;
      type?: string;
      webhookUrl?: string;
    }
  ) {
    return this.integrationService.createChannelConnection(request.tenantOperatorContext?.tenantId ?? "", payload);
  }

  @Patch("channels/types/:type/status")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateChannelTypeStatus",
    summary: "Enable or disable every tenant connection of one channel type"
  })
  @ApiParam({ name: "type", description: "Channel type, for example telegram, sdk, vk or max" })
  @ApiOkResponse({ description: "Updated aggregate channel status envelope with immutable audit evidence" })
  updateChannelTypeStatus(
    @Req() request: TenantOperatorRequest,
    @Param("type") type: string,
    @Body() payload: { enabled?: boolean; reason?: string }
  ) {
    return this.integrationService.updateChannelTypeStatus(request.tenantOperatorContext?.tenantId ?? "", type, payload);
  }

  @Patch("channels/:connectionId")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateChannelConnection",
    summary: "Update a tenant channel connection instance"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Updated channel connection envelope with masked credentials" })
  updateChannelConnection(
    @Req() request: TenantOperatorRequest,
    @Param("connectionId") connectionId: string,
    @Body() payload: Record<string, unknown>
  ) {
    return this.integrationService.updateChannelConnection(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
  }

  @Delete("channels/:connectionId")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "deleteChannelConnection",
    summary: "Permanently delete a tenant channel connection instance"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Deleted channel connection envelope" })
  deleteChannelConnection(
    @Req() request: TenantOperatorRequest,
    @Param("connectionId") connectionId: string,
    @Body() payload: { reason?: string } = {}
  ) {
    return this.integrationService.deleteChannelConnection(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
  }

  @Post("channels/:connectionId/test")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "testChannelConnectionInstance",
    summary: "Queue a receive/send test for a concrete channel connection"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Queued channel connection test envelope" })
  testChannelConnectionInstance(
    @Req() request: TenantOperatorRequest,
    @Param("connectionId") connectionId: string,
    @Body() payload: {
      environment?: string;
      message?: string;
      mode?: "receive" | "send";
      recipient?: string;
    }
  ) {
    return this.integrationService.testChannelConnectionInstance(request.tenantOperatorContext?.tenantId ?? "", connectionId, payload);
  }

  @Get("channels/:connectionId/events")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({
    operationId: "listChannelConnectionEvents",
    summary: "List channel connection audit and health events"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Channel connection events envelope" })
  fetchChannelConnectionEvents(@Req() request: TenantOperatorRequest, @Param("connectionId") connectionId: string) {
    return this.integrationService.fetchChannelConnectionEvents(request.tenantOperatorContext?.tenantId ?? "", connectionId);
  }

  @Post("channel-tests")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Queued channel test envelope" })
  testChannelConnection(@Body() payload: {
    channelId?: string;
    connectionId?: string;
    environment?: string;
    message?: string;
    mode?: "receive" | "send";
    recipient?: string;
  }) {
    return this.integrationService.testChannelConnection(payload);
  }

  @Post("api-keys")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Creates a public API key; the raw secret is returned exactly once in this response and only its hash is stored.",
    operationId: "createPublicApiKey",
    summary: "Create a public API key"
  })
  @ApiBody({
    schema: {
      properties: {
        environment: { enum: ["production", "stage"], type: "string" },
        name: { type: "string" },
        scopes: { items: { type: "string" }, type: "array" }
      },
      required: ["name"],
      type: "object"
    }
  })
  @ApiOkResponse({ description: "Created API key envelope; the raw secret appears only in this one-time response" })
  createPublicApiKey(@Body() payload: { environment?: string; name?: string; scopes?: string[] } = {}) {
    return this.integrationService.createPublicApiKey(payload);
  }

  @Post("api-keys/:keyId/rotate")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Queues public API key rotation; raw key material is never returned in the response.",
    operationId: "rotatePublicApiKey",
    summary: "Rotate a public API key"
  })
  @ApiParam({ name: "keyId", description: "Public API key identifier to rotate" })
  @ApiOkResponse({ description: "Queued API key rotation envelope; raw key material is never returned" })
  rotateApiKey(@Param("keyId") keyId: string) {
    return this.integrationService.rotateApiKey(keyId);
  }

  @Post("api-keys/:keyId/revoke")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Revokes a public API key immediately; revoked keys stop authenticating public API requests.",
    operationId: "revokePublicApiKey",
    summary: "Revoke a public API key"
  })
  @ApiParam({ name: "keyId", description: "Public API key identifier to revoke" })
  @ApiOkResponse({ description: "Revoked API key envelope with immutable audit evidence" })
  revokePublicApiKey(@Param("keyId") keyId: string) {
    return this.integrationService.revokePublicApiKey(keyId);
  }

  @Post("webhooks/endpoints")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "createWebhookEndpoint",
    summary: "Create a signed webhook endpoint"
  })
  @ApiBody({
    schema: {
      properties: {
        channel: { type: "string" },
        name: { type: "string" },
        url: { type: "string" }
      },
      required: ["name", "url"],
      type: "object"
    }
  })
  @ApiOkResponse({ description: "Created webhook endpoint envelope" })
  createWebhookEndpoint(@Body() payload: { channel?: string; name?: string; url?: string } = {}) {
    return this.integrationService.createWebhookEndpoint(payload);
  }

  @Patch("webhooks/endpoints/:endpointId")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateWebhookEndpoint",
    summary: "Update or enable/disable a signed webhook endpoint"
  })
  @ApiParam({ name: "endpointId", description: "Webhook endpoint identifier" })
  @ApiBody({
    required: false,
    schema: {
      properties: {
        name: { type: "string" },
        status: { enum: ["active", "disabled"], type: "string" },
        url: { type: "string" }
      },
      type: "object"
    }
  })
  @ApiOkResponse({ description: "Updated webhook endpoint envelope" })
  updateWebhookEndpoint(
    @Param("endpointId") endpointId: string,
    @Body() payload: { name?: string; status?: string; url?: string } = {}
  ) {
    return this.integrationService.updateWebhookEndpoint(endpointId, payload);
  }

  @Delete("webhooks/endpoints/:endpointId")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "deleteWebhookEndpoint",
    summary: "Delete a signed webhook endpoint"
  })
  @ApiParam({ name: "endpointId", description: "Webhook endpoint identifier" })
  @ApiOkResponse({ description: "Deleted webhook endpoint envelope" })
  deleteWebhookEndpoint(@Param("endpointId") endpointId: string) {
    return this.integrationService.deleteWebhookEndpoint(endpointId);
  }

  @Post("webhooks/deliveries/:deliveryId/replay")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Signed webhook delivery replay endpoint; original trace id is preserved and duplicate idempotency keys return the original replay descriptor.",
    operationId: "replaySignedWebhookDelivery",
    summary: "Replay a signed webhook delivery"
  })
  @ApiParam({ name: "deliveryId", description: "Webhook delivery identifier to replay" })
  @ApiBody({
    required: false,
    schema: {
      properties: {
        idempotencyKey: { type: "string" }
      },
      type: "object"
    }
  })
  @ApiOkResponse({ description: "Queued webhook replay envelope; original trace id is preserved" })
  replayWebhookDelivery(@Param("deliveryId") deliveryId: string, @Body() payload: { idempotencyKey?: string } = {}) {
    return this.integrationService.replayWebhookDelivery({ deliveryId, idempotencyKey: payload.idempotencyKey });
  }

  @Post("security/sessions/:sessionId/revoke")
  @UseGuards(TenantOperatorOrServiceAdminGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Security session revoke envelope" })
  revokeSecuritySession(@Param("sessionId") sessionId: string) {
    return this.integrationService.revokeSecuritySession(sessionId);
  }

  @Get("channels/telegram")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.read")
  @ApiOperation({
    operationId: "fetchTelegramConnection",
    summary: "Read tenant Telegram bot connection settings"
  })
  @ApiOkResponse({ description: "Masked Telegram connection envelope" })
  fetchTelegramConnection(@Req() request: TenantOperatorRequest) {
    return this.integrationService.fetchTelegramConnection(request.tenantOperatorContext?.tenantId ?? "");
  }

  @Post("channels/telegram")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "saveTelegramConnection",
    summary: "Save tenant Telegram bot token and webhook secret"
  })
  @ApiBody({
    schema: {
      properties: {
        botToken: { type: "string" }
      },
      required: ["botToken"],
      type: "object"
    }
  })
  @ApiOkResponse({ description: "Saved Telegram connection envelope" })
  saveTelegramConnection(
    @Req() request: TenantOperatorRequest,
    @Body() payload: { botToken?: string }
  ) {
    return this.integrationService.saveTelegramConnection(request.tenantOperatorContext?.tenantId ?? "", payload);
  }

  @Delete("channels/telegram")
  @UseGuards(TenantOperatorAuthGuard)
  @RequireTenantOperatorPermission("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "disconnectTelegramConnection",
    summary: "Disable tenant Telegram bot connection"
  })
  @ApiOkResponse({ description: "Disconnected Telegram connection envelope" })
  disconnectTelegramConnection(@Req() request: TenantOperatorRequest) {
    return this.integrationService.disconnectTelegramConnection(request.tenantOperatorContext?.tenantId ?? "");
  }
}
