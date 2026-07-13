import { Module } from "@nestjs/common";
import { WorkspaceAuditController } from "./workspace-audit.controller.js";
import { WorkspaceAuditService } from "./workspace-audit.service.js";

@Module({
  controllers: [WorkspaceAuditController],
  providers: [WorkspaceAuditService],
  exports: [WorkspaceAuditService]
})
export class WorkspaceAuditModule {}
