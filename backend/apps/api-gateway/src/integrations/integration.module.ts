import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { IdentityModule } from "../identity/identity.module.js";
import { IntegrationController } from "./integration.controller.js";
import { IntegrationService } from "./integration.service.js";
import { PublicApiController } from "./public-api.controller.js";
import { TelegramWebhookController } from "./telegram-webhook.controller.js";

@Module({
  imports: [ConversationModule, IdentityModule],
  controllers: [IntegrationController, PublicApiController, TelegramWebhookController],
  providers: [IntegrationService]
})
export class IntegrationModule {}
