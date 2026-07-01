import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
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
}
