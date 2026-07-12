import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { AutomationService } from "../automation/automation.service.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { handleTelegramWebhookFromRoute } from "./telegram-webhook.route.js";

@ApiTags("webhooks")
@Controller("webhooks")
export class TelegramWebhookController {
  private readonly conversationRepository = ConversationRepository.default();
  private readonly integrationRepository = IntegrationRepository.default();

  constructor(
    private readonly conversationService: ConversationService = new ConversationService(),
    private readonly routingService: RoutingService = new RoutingService(),
    private readonly qualityService: QualityService = new QualityService(),
    private readonly automationService: AutomationService = new AutomationService()
  ) {}

  @Post("telegram")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Telegram Bot API webhook ingress envelope" })
  receiveTelegramWebhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>
  ) {
    return handleTelegramWebhookFromRoute({
      autoAssignConversation: (conversationId, tenantId) => this.routingService.autoAssignConversation(conversationId, { tenantId }),
      body,
      conversationRepository: this.conversationRepository,
      conversationService: this.conversationService,
      headers,
      integrationRepository: this.integrationRepository,
      recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context),
      runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event)
    });
  }
}
