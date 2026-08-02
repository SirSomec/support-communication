var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ConversationModule } from "../conversation/conversation.module.js";
import { AutomationModule } from "../automation/automation.module.js";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { IdentityModule } from "../identity/identity.module.js";
import { RoutingModule } from "../routing/routing.module.js";
import { QueueDirectoryRepository } from "../routing/queue-directory.repository.js";
import { QualityModule } from "../quality/quality.module.js";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { IntegrationController } from "./integration.controller.js";
import { IntegrationService } from "./integration.service.js";
import { PublicApiController } from "./public-api.controller.js";
import { PublicDemoRequestController } from "./public-demo-request.controller.js";
import { PublicDemoRequestService } from "./public-demo-request.service.js";
import { TelegramWebhookController } from "./telegram-webhook.controller.js";
import { ProviderWebhookController } from "./provider-webhook.controller.js";
let IntegrationModule = class IntegrationModule {
};
IntegrationModule = __decorate([
    Module({
        imports: [AutomationModule, ConversationModule, IdentityModule, QualityModule, RoutingModule, WorkspaceModule],
        controllers: [IntegrationController, ProviderWebhookController, PublicApiController, PublicDemoRequestController, TelegramWebhookController],
        providers: [
            {
                provide: IntegrationService,
                // Composition root: the SupportQueue directory always reads Postgres in the
                // prisma-only runtime; tests construct IntegrationService directly and inject fakes.
                useFactory: () => new IntegrationService(undefined, { queueDirectoryRepository: new QueueDirectoryRepository() })
            },
            PublicDemoRequestService,
            TenantOperatorOrServiceAdminGuard
        ]
    })
], IntegrationModule);
export { IntegrationModule };
//# sourceMappingURL=integration.module.js.map