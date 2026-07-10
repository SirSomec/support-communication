import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { IdentityModule } from "../identity/identity.module.js";
import { IntegrationController } from "./integration.controller.js";
import { IntegrationService } from "./integration.service.js";
import { PublicApiController } from "./public-api.controller.js";
import { PublicDemoRequestController } from "./public-demo-request.controller.js";
import { PublicDemoRequestService } from "./public-demo-request.service.js";
import { TelegramWebhookController } from "./telegram-webhook.controller.js";

@Module({
  imports: [ConversationModule, IdentityModule],
  controllers: [IntegrationController, PublicApiController, PublicDemoRequestController, TelegramWebhookController],
  providers: [IntegrationService, PublicDemoRequestService, TenantOperatorOrServiceAdminGuard]
})
export class IntegrationModule {}
