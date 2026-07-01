import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { handleTelegramWebhookFromRoute } from "./telegram-webhook.route.js";

@ApiTags("webhooks")
@Controller("webhooks")
export class TelegramWebhookController {
  private readonly conversationRepository = ConversationRepository.default();
  private readonly integrationRepository = IntegrationRepository.default();

  constructor(private readonly conversationService: ConversationService = new ConversationService()) {}

  @Post("telegram")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Telegram Bot API webhook ingress envelope" })
  receiveTelegramWebhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>
  ) {
    return handleTelegramWebhookFromRoute({
      body,
      conversationRepository: this.conversationRepository,
      conversationService: this.conversationService,
      headers,
      integrationRepository: this.integrationRepository
    });
  }
}
