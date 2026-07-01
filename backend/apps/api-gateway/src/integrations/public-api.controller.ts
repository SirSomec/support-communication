import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import {
  type PublicApiEnvironment,
  type PublicApiKeyLookup
} from "./public-api-auth.js";
import { identifyPublicClientFromRoute } from "./public-api.route.js";
import {
  handlePublicSdkMessageIngressFromRoute,
  handlePublicSdkMessagesPollFromRoute,
  resolveOrCreatePublicSdkConversation
} from "./public-sdk-messages.route.js";

@ApiTags("public")
@ApiBearerAuth()
@Controller("public")
export class PublicApiController {
  private readonly conversationRepository = ConversationRepository.default();
  protected readonly lookup: PublicApiKeyLookup = runtimePublicApiKeyLookup();

  constructor(private readonly conversationService: ConversationService = new ConversationService()) {}

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

      const authContext = response.data?.context as { tenantId?: string } | undefined;
      const tenantId = String(authContext?.tenantId ?? "").trim();
      if (!tenantId) {
        return response;
      }

      const conversation = await resolveOrCreatePublicSdkConversation({
        conversationRepository: this.conversationRepository,
        externalId: payload.externalId,
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
      body: payload,
      conversationRepository: this.conversationRepository,
      conversationService: this.conversationService,
      environment,
      lookup: this.lookup
    });
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
  @ApiOkResponse({ description: "Public SDK poll envelope with operator reply messages only" })
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
