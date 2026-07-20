import { Module } from "@nestjs/common";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { RoutingModule } from "../routing/routing.module.js";
import { RoutingService } from "../routing/routing.service.js";
import { PresenceController } from "./presence.controller.js";
import { OperatorPresenceService } from "./presence.service.js";

@Module({
  imports: [RoutingModule],
  controllers: [PresenceController],
  providers: [{
    provide: OperatorPresenceService,
    inject: [RoutingService],
    useFactory: (routingService: RoutingService) => new OperatorPresenceService({
      autoAssignQueuedConversations: async (tenantId: string) => {
        // Routing owns the eligibility checks. Process sequentially so each
        // assignment observes the capacity consumed by the previous one.
        const conversations = await ConversationRepository.default().listConversations({ take: 200, tenantId });
        for (const conversation of conversations) {
          if (conversation.status !== "queued" || conversation.operatorId) continue;
          await routingService.autoAssignConversation(conversation.id, { tenantId });
        }
      }
    })
  }],
  exports: [OperatorPresenceService]
})
export class PresenceModule {}
