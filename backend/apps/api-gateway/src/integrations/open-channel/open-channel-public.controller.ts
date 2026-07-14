import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../../conversation/conversation.repository.js";
import { ConversationService } from "../../conversation/conversation.service.js";
import { RoutingService } from "../../routing/routing.service.js";
import { QualityService } from "../../quality/quality.service.js";
import { IdentityRepository } from "../../identity/identity.repository.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import { handleOpenChatInbound, handleOpenChatStatus, type OpenChatEvent, type OpenChatRouteResult } from "./open-chat.route.js";
import { ExternalBotBridge, handleExternalBotProviderEvent } from "./external-bot.route.js";

/**
 * Public endpoints of the external integration surface. URL shapes follow
 * the token-in-path convention of popular live-chat platforms, so a
 * migrating customer only swaps the host and tokens:
 *  - Open Channel chat: POST /api/v1/open-channel/:token
 *                       GET  /api/v1/open-channel/:token/status
 *  - External Bot API:  POST /api/v1/external-bot/webhooks/:connectionId/:token
 */

interface HttpResponseLike {
  send(body: unknown): void;
  set(header: string, value: string): this;
  status(code: number): this;
}

@ApiTags("open-channel")
@Controller()
export class OpenChannelPublicController {
  private readonly conversationRepository = ConversationRepository.default();
  private readonly repository = OpenChannelRepository.default();

  constructor(
    private readonly conversationService: ConversationService = new ConversationService(),
    private readonly routingService: RoutingService = new RoutingService(),
    private readonly qualityService: QualityService = new QualityService()
  ) {}

  @Post("open-channel/:channelToken")
  @ApiOperation({
    description: "Open Channel chat ingress: POST {sender, recipient, message} events.",
    operationId: "receiveOpenChatEvent",
    summary: "Receive an Open Channel chat event"
  })
  @ApiParam({ name: "channelToken", description: "Open Channel chat token from the channel settings" })
  async receiveOpenChatEvent(
    @Param("channelToken") channelToken: string,
    @Body() body: OpenChatEvent,
    @Res() response: HttpResponseLike
  ): Promise<void> {
    const result = await handleOpenChatInbound({
      body: body ?? {},
      botBridge: this.botBridge(),
      channelToken,
      conversationRepository: this.conversationRepository,
      conversationService: this.conversationService,
      recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context),
      repository: this.repository
    });
    respond(response, result);
  }

  @Get("open-channel/:channelToken/status")
  @ApiOperation({
    description: "Open Channel chat status: body is 0 when no active dialogs exist, 1 otherwise.",
    operationId: "fetchOpenChannelStatus",
    summary: "Fetch Open Channel chat status"
  })
  @ApiParam({ name: "channelToken", description: "Chat API channel token" })
  async fetchOpenChannelStatus(
    @Param("channelToken") channelToken: string,
    @Res() response: HttpResponseLike
  ): Promise<void> {
    const result = await handleOpenChatStatus({
      channelToken,
      conversationRepository: this.conversationRepository,
      repository: this.repository
    });
    respond(response, result);
  }

  @Post("external-bot/webhooks/:connectionId/:token")
  @ApiExcludeEndpoint()
  async receiveExternalBotEvent(
    @Param("connectionId") connectionId: string,
    @Param("token") token: string,
    @Body() body: Record<string, unknown>,
    @Res() response: HttpResponseLike
  ): Promise<void> {
    const result = await handleExternalBotProviderEvent({
      autoAssignConversation: async (conversationId, tenantId) => {
        const assigned = await this.routingService.autoAssignConversation(conversationId, { tenantId });
        return { status: assigned.status };
      },
      body: body ?? {},
      bridge: this.botBridge(),
      connectionId,
      conversationRepository: this.conversationRepository,
      repository: this.repository,
      token
    });
    response.status(result.statusCode).set("content-type", "application/json; charset=utf-8").send(result.body);
  }

  private botBridge(): ExternalBotBridge {
    return new ExternalBotBridge({
      agentsOnline: (tenantId) => resolveAgentsOnline(tenantId),
      delivery: openChannelDeliveryService(),
      repository: this.repository
    });
  }
}

let sharedDelivery: OpenChannelDeliveryService | null = null;

/** One delivery queue per process so controller instances share the journal. */
export function openChannelDeliveryService(): OpenChannelDeliveryService {
  if (!sharedDelivery) {
    sharedDelivery = new OpenChannelDeliveryService({
      conversationRepository: ConversationRepository.default(),
      repository: OpenChannelRepository.default()
    });
  }
  return sharedDelivery;
}

export function resetOpenChannelDeliveryService(): void {
  sharedDelivery?.stop();
  sharedDelivery = null;
}

/**
 * Presence approximation for agents_online / chatMode: at least one active
 * tenant user. Real per-operator presence lives in the operator app; this
 * stays intentionally cheap for the public endpoint.
 */
export async function resolveAgentsOnline(tenantId: string): Promise<boolean> {
  const users = await IdentityRepository.default().findTenantUsers(tenantId);
  return users.some((user) => user.status === "active");
}

function respond(response: HttpResponseLike, result: OpenChatRouteResult): void {
  response.status(result.statusCode).set("content-type", result.contentType).send(result.body);
}
