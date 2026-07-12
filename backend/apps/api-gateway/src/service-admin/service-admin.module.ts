import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { ServiceAdminController } from "./service-admin.controller.js";
import { ServiceAdminService } from "./service-admin.service.js";

@Module({
  controllers: [ServiceAdminController],
  providers: [ServiceAdminService, ServiceAdminSessionGuard],
  exports: [ServiceAdminService]
})
export class ServiceAdminModule {}
