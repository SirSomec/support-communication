import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
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

  @Get("channels")
  @ApiOperation({
    operationId: "listChannelConnections",
    summary: "List tenant channel connection instances"
  })
  @ApiOkResponse({ description: "Channel connection instances envelope" })
  fetchChannelConnections(@Query() query: { type?: string }) {
    return this.integrationService.fetchChannelConnections(query);
  }

  @Post("channels")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "createChannelConnection",
    summary: "Create a tenant channel connection instance"
  })
  @ApiOkResponse({ description: "Created channel connection envelope with masked credentials" })
  createChannelConnection(@Body() payload: {
    chatLimit?: number;
    credentials?: Record<string, unknown>;
    environment?: string;
    name?: string;
    routingQueueId?: string;
    status?: string;
    type?: string;
    webhookUrl?: string;
  }) {
    return this.integrationService.createChannelConnection(payload);
  }

  @Patch("channels/:connectionId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "updateChannelConnection",
    summary: "Update a tenant channel connection instance"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Updated channel connection envelope with masked credentials" })
  updateChannelConnection(@Param("connectionId") connectionId: string, @Body() payload: Record<string, unknown>) {
    return this.integrationService.updateChannelConnection(connectionId, payload);
  }

  @Delete("channels/:connectionId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "deleteChannelConnection",
    summary: "Disable a tenant channel connection instance"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Disabled channel connection envelope" })
  deleteChannelConnection(@Param("connectionId") connectionId: string, @Body() payload: { reason?: string } = {}) {
    return this.integrationService.deleteChannelConnection(connectionId, payload);
  }

  @Post("channels/:connectionId/test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "testChannelConnectionInstance",
    summary: "Queue a receive/send test for a concrete channel connection"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Queued channel connection test envelope" })
  testChannelConnectionInstance(
    @Param("connectionId") connectionId: string,
    @Body() payload: {
      environment?: string;
      message?: string;
      mode?: "receive" | "send";
      recipient?: string;
    }
  ) {
    return this.integrationService.testChannelConnectionInstance(connectionId, payload);
  }

  @Get("channels/:connectionId/events")
  @ApiOperation({
    operationId: "listChannelConnectionEvents",
    summary: "List channel connection audit and health events"
  })
  @ApiParam({ name: "connectionId", description: "Channel connection identifier" })
  @ApiOkResponse({ description: "Channel connection events envelope" })
  fetchChannelConnectionEvents(@Param("connectionId") connectionId: string) {
    return this.integrationService.fetchChannelConnectionEvents(connectionId);
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

  @Post("api-keys/:keyId/rotate")
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

  @Post("webhooks/deliveries/:deliveryId/replay")
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
