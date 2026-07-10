import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { IncidentController } from "./incident.controller.js";
import { IncidentService } from "./incident.service.js";

@Module({
  controllers: [IncidentController],
  providers: [ServiceAdminSessionGuard, IncidentService],
  exports: [IncidentService]
})
export class IncidentModule {}
