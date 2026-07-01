import { Module } from "@nestjs/common";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { BillingController, QuotaController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({
  controllers: [BillingController, QuotaController],
  providers: [BillingService, DemoServiceAdminGuard],
  exports: [BillingService]
})
export class BillingModule {}
