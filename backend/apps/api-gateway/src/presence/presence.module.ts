import { Module } from "@nestjs/common";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { RoutingModule } from "../routing/routing.module.js";
import { RoutingService } from "../routing/routing.service.js";
import { PresenceController } from "./presence.controller.js";
import { OperatorPresenceService } from "./presence.service.js";
import { listUnassignedQueueConversationIds } from "./queue-drain.js";

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
        const conversationIds = await listUnassignedQueueConversationIds(ConversationRepository.default(), tenantId);
        for (const conversationId of conversationIds) {
          await routingService.autoAssignConversation(conversationId, { tenantId });
        }
      }
    })
  }],
  exports: [OperatorPresenceService]
})
export class PresenceModule {}
