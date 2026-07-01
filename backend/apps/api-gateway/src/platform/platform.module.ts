import { Module } from "@nestjs/common";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { PlatformController, PlatformMonitoringAliasController } from "./platform.controller.js";
import { PlatformMonitoringService } from "./platform-monitoring.service.js";

@Module({
  controllers: [PlatformController, PlatformMonitoringAliasController],
  providers: [DemoServiceAdminGuard, PlatformMonitoringService],
  exports: [PlatformMonitoringService]
})
export class PlatformModule {}
