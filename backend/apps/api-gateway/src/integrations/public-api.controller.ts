import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { AutomationService } from "../automation/automation.service.js";
import { ProactiveExposureRepository } from "../automation/proactive-exposure.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import {
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";
import { identifyPublicClientFromRoute } from "./public-api.route.js";
import {
  handlePublicSdkCsatFeedbackDeclineFromRoute,
  handlePublicSdkMessageIngressFromRoute,
  handlePublicSdkMessagesPollFromRoute,
  handlePublicSdkQualityRatingFromRoute,
  resolveOrCreatePublicSdkConversation
} from "./public-sdk-messages.route.js";
import { handlePublicSdkPresenceDisconnect, handlePublicSdkPresenceHeartbeat, type PublicSdkPresenceBody } from "./public-sdk-presence.route.js";
import { handlePublicSdkInvitationAcknowledge, handlePublicSdkInvitationPoll } from "./public-sdk-invitations.route.js";
import { OpenChannelRepository } from "./open-channel/open-channel.repository.js";
import { ExternalBotBridge } from "./open-channel/external-bot.route.js";
import { handleAgentsOnlineStatus, handleWidgetClientInfoFromRoute, type WidgetClientInfoBody } from "./open-channel/client-info.route.js";
import { openChannelDeliveryService, resolveAgentsOnline } from "./open-channel/open-channel-public.controller.js";

@ApiTags("public")
@ApiBearerAuth()
@Controller("public")
export class PublicApiController {
  private readonly conversationRepository = ConversationRepository.default();
  private readonly integrationRepository = IntegrationRepository.default();
  private readonly proactiveExposureRepository = ProactiveExposureRepository.default();
  protected readonly lookup: PublicApiKeyLookup = runtimePublicApiKeyLookup();

  constructor(
    private readonly conversationService: ConversationService = new ConversationService(),
    private readonly routingService: RoutingService = new RoutingService(),
    private readonly qualityService: QualityService = new QualityService(),
    private readonly automationService: AutomationService = new AutomationService()
  ) {}

  @Post("sdk/presence/heartbeat")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "heartbeatPublicSdkPresence", summary: "Refresh an anonymous SDK visitor presence session" })
  heartbeatPublicSdkPresence(@Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production", @Body() payload: PublicSdkPresenceBody = {}) {
    return handlePublicSdkPresenceHeartbeat({ authorization, body: payload, environment, lookup: this.lookup,
      repository: this.integrationRepository });
  }

  @Post("sdk/presence/disconnect")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "disconnectPublicSdkPresence", summary: "Disconnect an SDK visitor presence session" })
  disconnectPublicSdkPresence(@Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production", @Body() payload: PublicSdkPresenceBody = {}) {
    return handlePublicSdkPresenceDisconnect({ authorization, body: payload, environment, lookup: this.lookup,
      repository: this.integrationRepository });
  }

  @Get("sdk/invitations")
  @ApiOperation({ operationId: "pollPublicSdkInvitations", summary: "Poll pending proactive invitations for a live SDK session" })
  pollPublicSdkInvitations(@Headers("authorization") authorization: string | undefined,
    @Query("sessionId") sessionId: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production") {
    return handlePublicSdkInvitationPoll({ authorization, environment, exposureRepository: this.proactiveExposureRepository,
      integrationRepository: this.integrationRepository, lookup: this.lookup, sessionId });
  }

  @Post("sdk/invitations/:exposureId/:action")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "acknowledgePublicSdkInvitation", summary: "Acknowledge a proactive SDK invitation lifecycle event" })
  acknowledgePublicSdkInvitation(@Headers("authorization") authorization: string | undefined,
    @Param("exposureId") exposureId: string, @Param("action") action: "shown" | "dismissed" | "accepted" | "failed",
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { conversationId?: string; failureCode?: string; sessionId?: string } = {}) {
    if (!["shown", "dismissed", "accepted", "failed"].includes(action)) {
      return { status: "invalid", data: {}, error: { code: "proactive_exposure_action_invalid", message: "Unsupported invitation action." } };
    }
    return handlePublicSdkInvitationAcknowledge({ action, authorization, conversationId: payload.conversationId,
      environment, exposureId, exposureRepository: this.proactiveExposureRepository, failureCode: payload.failureCode,
      integrationRepository: this.integrationRepository, lookup: this.lookup,
      onAccepted: async (exposure) => exposure ? (await resolveOrCreatePublicSdkConversation({
        conversationRepository: this.conversationRepository, externalId: `proactive:${exposure.subjectId}`,
        pageUrl: typeof exposure.segmentSnapshot.page === "string" ? exposure.segmentSnapshot.page : undefined,
        queueId: await this.resolveSdkQueueId(exposure.tenantId, exposure.channelConnectionId), tenantId: exposure.tenantId
      }))?.id ?? null : null,
      sessionId: payload.sessionId });
  }

  @Post("sdk/identify")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Public SDK identify runtime endpoint; denial envelopes include rate-limit metadata.",
    operationId: "identifyPublicSdkClient",
    summary: "Identify a public SDK client"
  })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK identify envelope guarded by public API key auth" })
  identifyPublicClient(
    @Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { externalId?: string; traits?: Record<string, unknown> } = {}
  ) {
    return identifyPublicClientFromRoute(this.lookup, authorization, environment, payload).then(async (response) => {
      if (response.status !== "ok") {
        return response;
      }

      const authContext = response.data?.context as { channelConnectionId?: string | null; tenantId?: string } | undefined;
      const tenantId = String(authContext?.tenantId ?? "").trim();
      if (!tenantId) {
        return response;
      }

      const conversation = await resolveOrCreatePublicSdkConversation({
        conversationRepository: this.conversationRepository,
        externalId: payload.externalId,
        queueId: await this.resolveSdkQueueId(tenantId, authContext?.channelConnectionId),
        tenantId
      });

      return {
        ...response,
        data: {
          ...response.data,
          conversationId: conversation?.id ?? null
        }
      };
    });
  }

  @Post("sdk/messages")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Public SDK message ingress endpoint.",
    operationId: "sendPublicSdkMessage",
    summary: "Accept a public SDK message"
  })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK ingress envelope with conversation and visitor session token" })
  sendPublicSdkMessage(
    @Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { conversationId?: string; externalId?: string; pageUrl?: string; text?: string } = {}
  ) {
    return handlePublicSdkMessageIngressFromRoute({
      authorization,
      autoAssignConversation: (conversationId, tenantId) => this.routingService.autoAssignConversation(conversationId, { tenantId }),
      body: payload,
      conversationRepository: this.conversationRepository,
      conversationService: this.conversationService,
      environment,
      lookup: this.lookup,
      recordProactiveConversion: this.proactiveExposureRepository,
      runBotRuntime: (event) => this.runBotRuntimeWithExternalBridge(event, payload),
      resolveQueueId: (tenantId, channelConnectionId) => this.resolveSdkQueueId(tenantId, channelConnectionId)
    });
  }

  /**
   * An external bot connected through the External Bot API takes priority over
   * the built-in scenario runtime; when it owns the dialog the message is
   * forwarded to the provider and operator auto-assignment is suppressed.
   */
  private async runBotRuntimeWithExternalBridge(
    event: { channel: string; conversationId: string; eventId: string; payload?: Record<string, unknown>; tenantId: string; traceId: string },
    payload: { externalId?: string; pageUrl?: string; text?: string }
  ): Promise<{ instance?: { status?: string }; outcome?: string }> {
    const externalRepository = OpenChannelRepository.default();
    if (await externalRepository.findActiveBotConnectionForChannel(event.tenantId, event.channel)) {
      const conversation = await this.conversationRepository.findConversation(event.conversationId);
      if (conversation && conversation.tenantId === event.tenantId) {
        const bridge = new ExternalBotBridge({
          agentsOnline: (tenantId) => resolveAgentsOnline(tenantId),
          delivery: openChannelDeliveryService(),
          repository: externalRepository
        });
        const handled = await bridge.forwardClientMessage({
          channel: event.channel,
          clientId: String(payload.externalId ?? "").trim() || conversation.providerConversationId || conversation.phone || conversation.id,
          conversation,
          pageUrl: payload.pageUrl,
          tenantId: event.tenantId,
          text: String(payload.text ?? "")
        });
        if (handled) {
          return { instance: { status: "active" }, outcome: "external_bot" };
        }
      }
    }
    return this.automationService.handleBotRuntimeInboundEvent(event);
  }

  @Post("sdk/client-info")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description: "Widget client card update (sw_api.setContactInfo / setCustomData / setUserToken / setClientAttributes).",
    operationId: "updatePublicSdkClientInfo",
    summary: "Update public SDK visitor client info"
  })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  updatePublicSdkClientInfo(
    @Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: WidgetClientInfoBody = {}
  ) {
    return handleWidgetClientInfoFromRoute({
      authorization,
      body: payload,
      conversationRepository: this.conversationRepository,
      delivery: openChannelDeliveryService(),
      environment,
      lookup: this.lookup
    });
  }

  @Get("sdk/agents/status")
  @ApiOperation({
    description: "Whether at least one agent can take chats (sw_api.chatMode).",
    operationId: "fetchPublicSdkAgentsStatus",
    summary: "Fetch public SDK agents online status"
  })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  fetchPublicSdkAgentsStatus(
    @Headers("authorization") authorization: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production"
  ) {
    return handleAgentsOnlineStatus({
      authorization,
      environment,
      lookup: this.lookup,
      resolveAgentsOnline: (tenantId) => resolveAgentsOnline(tenantId)
    });
  }

  @Post("sdk/conversations/:conversationId/ratings")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "recordPublicSdkQualityRating", summary: "Record a public SDK conversation rating" })
  @ApiParam({ name: "conversationId", description: "SDK conversation identifier" })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK quality rating acceptance envelope" })
  recordPublicSdkQualityRating(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId") conversationId: string,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { idempotencyKey?: string; scale?: "CSAT" | "CSI"; score?: number; visitorSessionToken?: string } = {}
  ) {
    return handlePublicSdkQualityRatingFromRoute({
      authorization,
      body: payload,
      conversationId,
      conversationRepository: this.conversationRepository,
      environment,
      lookup: this.lookup,
      recordQualityRating: (rating, context) => this.qualityService.recordClientQualityRating(rating, context)
    });
  }

  @Post("sdk/conversations/:conversationId/csat-feedback/decline")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "declinePublicSdkCsatFeedback", summary: "Skip the CSAT feedback comment and unlock a new appeal" })
  @ApiParam({ name: "conversationId", description: "SDK conversation identifier" })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK CSAT feedback decline envelope" })
  declinePublicSdkCsatFeedback(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId") conversationId: string,
    @Query("environment") environment: PublicApiEnvironment = "production",
    @Body() payload: { visitorSessionToken?: string } = {}
  ) {
    return handlePublicSdkCsatFeedbackDeclineFromRoute({
      authorization,
      body: payload,
      conversationId,
      conversationRepository: this.conversationRepository,
      environment,
      lookup: this.lookup
    });
  }

  private async resolveSdkQueueId(tenantId: string, channelConnectionId?: string | null): Promise<string | undefined> {
    if (!channelConnectionId) return undefined;
    const connection = await this.integrationRepository.findChannelConnectionAsync(tenantId, channelConnectionId);
    if (!connection || connection.type.toLowerCase() !== "sdk" || connection.status.toLowerCase() !== "active") return undefined;
    return connection.routingQueueId || undefined;
  }

  @Get("sdk/conversations/:conversationId/messages")
  @ApiOperation({
    description: "Widget polling endpoint for public SDK operator replies.",
    operationId: "pollPublicSdkMessages",
    summary: "Poll public SDK conversation replies"
  })
  @ApiParam({ name: "conversationId", description: "SDK conversation identifier" })
  @ApiQuery({ name: "visitorSessionToken", required: true, description: "Short-lived signed visitor session token" })
  @ApiQuery({ name: "since", required: false, description: "Optional last seen operator message id" })
  @ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" })
  @ApiOkResponse({ description: "Public SDK poll envelope with operator reply messages only; ready attachments include short-lived signed download links" })
  pollPublicSdkConversationMessages(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId") conversationId: string,
    @Query("visitorSessionToken") visitorSessionToken: string | undefined,
    @Query("since") since: string | undefined,
    @Query("environment") environment: PublicApiEnvironment = "production"
  ) {
    return handlePublicSdkMessagesPollFromRoute({
      authorization,
      conversationId,
      conversationRepository: this.conversationRepository,
      environment,
      lookup: this.lookup,
      resolveDeliveryAttachments: (attachments, tenantId) =>
        this.conversationService.resolvePublicDeliveryAttachments(attachments, tenantId),
      since,
      visitorSessionToken
    });
  }
}

function runtimePublicApiKeyLookup(): PublicApiKeyLookup {
  const integrationRepository = IntegrationRepository.default();

  return {
    async findActiveKeyBySecretHash(secretHash) {
      return integrationRepository.findActiveKeyBySecretHash(secretHash);
    },
    async listActiveKeys() {
      return integrationRepository.listActiveKeys();
    }
  };
}
