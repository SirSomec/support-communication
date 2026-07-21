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

@Module({
  imports: [BillingModule],
  controllers: [ClientsController, FilesController, FileScanCallbackController, KnowledgeController, TemplatesController, TopicsController],
  providers: [
    TopicDirectoryService,
    {
      provide: WorkspaceService,
      inject: [BillingService],
      useFactory: (billingService: BillingService) => new WorkspaceService(undefined, {
        fileUploadQuota: createBillingFileUploadQuotaChecker(billingService)
      })
    }
  ],
  exports: [WorkspaceService]
})
export class WorkspaceModule {}
