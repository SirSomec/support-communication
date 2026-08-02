var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module.js";
import { BillingService } from "../billing/billing.service.js";
import { ClientsController } from "./clients.controller.js";
import { FileScanCallbackController, FilesController } from "./files.controller.js";
import { KnowledgeController } from "./knowledge.controller.js";
import { TemplatesController } from "./templates.controller.js";
import { TopicsController } from "./topics.controller.js";
import { TopicDirectoryService } from "./topic-directory.service.js";
import { createBillingFileUploadQuotaChecker } from "./workspace-quota.js";
import { WorkspaceService } from "./workspace.service.js";
let WorkspaceModule = class WorkspaceModule {
};
WorkspaceModule = __decorate([
    Module({
        imports: [BillingModule],
        controllers: [ClientsController, FilesController, FileScanCallbackController, KnowledgeController, TemplatesController, TopicsController],
        providers: [
            TopicDirectoryService,
            {
                provide: WorkspaceService,
                inject: [BillingService],
                useFactory: (billingService) => new WorkspaceService(undefined, {
                    fileUploadQuota: createBillingFileUploadQuotaChecker(billingService)
                })
            }
        ],
        exports: [WorkspaceService]
    })
], WorkspaceModule);
export { WorkspaceModule };
//# sourceMappingURL=workspace.module.js.map