import { Module } from "@nestjs/common";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { QueueDirectoryController } from "./queue-directory.controller.js";
import { QueueDirectoryRepository } from "./queue-directory.repository.js";
import { QueueDirectoryService } from "./queue-directory.service.js";
import { CanonicalRoutingWorkloadAdapter } from "./canonical-routing-workload.adapter.js";
import { CanonicalRoutingConversationRepository } from "./canonical-routing-conversation.repository.js";
import { RoutingRepository } from "./routing.repository.js";
import { RoutingController } from "./routing.controller.js";
import { RoutingService } from "./routing.service.js";

@Module({
  controllers: [RoutingController, QueueDirectoryController],
  providers: [
    QueueDirectoryRepository,
    QueueDirectoryService,
    {
      provide: RoutingService,
      useFactory: () => new RoutingService(
        RoutingRepository.default(),
        // The canonical workload adapter reads the SupportQueue directory through Prisma.
        // In json-store runtimes (local dev, Playwright stub) that would leak queues from
        // an unrelated database, so it is only wired when routing itself runs on Prisma.
        process.env.ROUTING_REPOSITORY === "prisma" ? new CanonicalRoutingWorkloadAdapter() : undefined,
        new CanonicalRoutingConversationRepository(),
        TeamDirectoryRepository.default()
      )
    }
  ],
  exports: [RoutingService]
})
export class RoutingModule {}
