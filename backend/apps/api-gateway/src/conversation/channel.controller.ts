import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ConversationService } from "./conversation.service.js";

@ApiTags("channels")
@UseGuards(DemoServiceAdminGuard)
@Controller("channels")
export class ChannelController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  @RequireServiceAdminAction("channels.read")
  @ApiOkResponse({ description: "Channel connector readiness envelope" })
  fetchChannels() {
    return this.conversationService.fetchChannels();
  }

  @Post(":channel/inbound")
  @RequireServiceAdminAction("channels.ingest")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Idempotent inbound channel event normalization envelope" })
  normalizeInboundEvent(
    @Param("channel") channel: string,
    @Body() payload: { conversationId?: string; eventId?: string; text?: string }
  ) {
    return this.conversationService.normalizeInboundEvent(channel, payload);
  }

  @Post(":channel/delivery-receipts")
  @RequireServiceAdminAction("channels.ingest")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Provider delivery receipt ingestion envelope" })
  recordDeliveryReceipt(
    @Param("channel") channel: string,
    @Body() payload: {
      conversationId?: string;
      idempotencyKey?: string;
      messageId?: string;
      payload?: Record<string, unknown>;
      provider?: string;
      providerEventId?: string;
      receivedAt?: string;
      status?: string;
      tenantId?: string;
      traceId?: string;
    }
  ) {
    return this.conversationService.recordDeliveryReceipt(channel, payload);
  }
}
