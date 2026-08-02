var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { RoutingModule } from "../routing/routing.module.js";
import { RoutingService } from "../routing/routing.service.js";
import { PresenceController } from "./presence.controller.js";
import { OperatorPresenceService } from "./presence.service.js";
let PresenceModule = class PresenceModule {
};
PresenceModule = __decorate([
    Module({
        imports: [RoutingModule],
        controllers: [PresenceController],
        providers: [{
                provide: OperatorPresenceService,
                inject: [RoutingService],
                useFactory: (routingService) => new OperatorPresenceService({
                    autoAssignQueuedConversations: async (tenantId) => {
                        // Routing owns the eligibility checks. Process sequentially so each
                        // assignment observes the capacity consumed by the previous one.
                        const conversations = await ConversationRepository.default().listConversations({ take: 200, tenantId });
                        for (const conversation of conversations) {
                            if (conversation.status !== "queued" || conversation.operatorId)
                                continue;
                            await routingService.autoAssignConversation(conversation.id, { tenantId });
                        }
                    }
                })
            }],
        exports: [OperatorPresenceService]
    })
], PresenceModule);
export { PresenceModule };
//# sourceMappingURL=presence.module.js.map