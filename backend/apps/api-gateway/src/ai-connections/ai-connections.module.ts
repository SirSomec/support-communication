import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { AiConnectionsController } from "./ai-connections.controller.js";
import { AiConnectionsService } from "./ai-connections.service.js";

@Module({
  controllers: [AiConnectionsController],
  providers: [AiConnectionsService, ServiceAdminSessionGuard],
  exports: [AiConnectionsService]
})
export class AiConnectionsModule {}
