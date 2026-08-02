import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { AutomationService } from "../automation/automation.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { handleProviderWebhookFromRoute } from "./provider-webhook.route.js";
import { ProviderMessageBindingRepository } from "./provider-message-binding.repository.js";
import { QualityService } from "../quality/quality.service.js";
import { fetchVkUserProfile } from "./vk-user-profile.js";

@ApiTags("webhooks")
@Controller("webhooks")
export class ProviderWebhookController {
  private readonly conversations = ConversationRepository.default();
  private readonly integrations = IntegrationRepository.default();
  private readonly providerMessageBindings = ProviderMessageBindingRepository.default();

  constructor(
    private readonly conversationService: ConversationService = new ConversationService(),
    private readonly automationService: AutomationService = new AutomationService(),
    private readonly qualityService: QualityService = new QualityService()
  ) {}

  @Post("vk/:connectionId")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "VK Callback API ingress" })
  receiveVk(@Param("connectionId") connectionId: string, @Body() body: Record<string, unknown>, @Headers() headers: Record<string, string | undefined>) {
    return handleProviderWebhookFromRoute({ body, channel: "VK", channelConnectionId: connectionId, conversationRepository: this.conversations, conversationService: this.conversationService, headers, integrationRepository: this.integrations, phoneCollectionEnabled: process.env.PROVIDER_PHONE_COLLECTION_ENABLED !== "false", providerMessageBindings: this.providerMessageBindings, recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context), resolveVkUserProfile: fetchVkUserProfile, runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event) });
  }

  @Post("max/:connectionId")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "MAX Bot API ingress" })
  receiveMax(@Param("connectionId") connectionId: string, @Body() body: Record<string, unknown>, @Headers() headers: Record<string, string | undefined>) {
    return handleProviderWebhookFromRoute({ body, channel: "MAX", channelConnectionId: connectionId, conversationRepository: this.conversations, conversationService: this.conversationService, headers, integrationRepository: this.integrations, phoneCollectionEnabled: process.env.PROVIDER_PHONE_COLLECTION_ENABLED !== "false", providerMessageBindings: this.providerMessageBindings, recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context), runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event) });
  }
}
