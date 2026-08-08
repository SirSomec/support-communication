import { Module } from "@nestjs/common";
import { WorkspaceModule } from "../workspace/workspace.module.js";
import { SupportTicketsController, SupportTicketsAdminController } from "./support-tickets.controller.js";
import { SupportTicketsService } from "./support-tickets.service.js";

@Module({
  imports: [WorkspaceModule],
  controllers: [SupportTicketsController, SupportTicketsAdminController],
  providers: [SupportTicketsService]
})
export class SupportTicketsModule {}
