import { Module } from "@nestjs/common";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { IncidentController } from "./incident.controller.js";
import { IncidentService } from "./incident.service.js";

@Module({
  controllers: [IncidentController],
  providers: [DemoServiceAdminGuard, IncidentService],
  exports: [IncidentService]
})
export class IncidentModule {}
