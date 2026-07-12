import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { PlatformController, PlatformMonitoringAliasController } from "./platform.controller.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";

@Module({
  controllers: [PlatformController, PlatformMonitoringAliasController],
  providers: [ServiceAdminSessionGuard, PlatformMonitoringService],
  exports: [PlatformMonitoringService]
})
export class PlatformModule {}
