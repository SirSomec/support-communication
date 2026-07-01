import { Module } from "@nestjs/common";
import { ClientsController } from "./clients.controller.js";
import { FilesController } from "./files.controller.js";
import { KnowledgeController } from "./knowledge.controller.js";
import { TemplatesController } from "./templates.controller.js";
import { TopicsController } from "./topics.controller.js";
import { TopicDirectoryService } from "./topic-directory.service.js";
import { WorkspaceService } from "./workspace.service.js";

@Module({
  controllers: [ClientsController, FilesController, KnowledgeController, TemplatesController, TopicsController],
  providers: [TopicDirectoryService, WorkspaceService]
})
export class WorkspaceModule {}
