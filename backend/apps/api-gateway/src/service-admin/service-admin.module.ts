import { Module } from "@nestjs/common";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { ServiceAdminController } from "./service-admin.controller.js";
import { ServiceAdminService } from "./service-admin.service.js";

@Module({
  controllers: [ServiceAdminController],
  providers: [ServiceAdminService, DemoServiceAdminGuard],
  exports: [ServiceAdminService]
})
export class ServiceAdminModule {}
