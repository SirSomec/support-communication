var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
let RoutingModule = class RoutingModule {
};
RoutingModule = __decorate([
    Module({
        controllers: [RoutingController, QueueDirectoryController],
        providers: [
            QueueDirectoryRepository,
            QueueDirectoryService,
            {
                provide: RoutingService,
                useFactory: () => new RoutingService(RoutingRepository.default(), 
                // Prisma-only runtime: routing and the SupportQueue directory read the same
                // Postgres database, so the canonical workload adapter is always wired.
                new CanonicalRoutingWorkloadAdapter(), new CanonicalRoutingConversationRepository(), TeamDirectoryRepository.default())
            }
        ],
        exports: [RoutingService]
    })
], RoutingModule);
export { RoutingModule };
//# sourceMappingURL=routing.module.js.map