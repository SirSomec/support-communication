import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { BillingController, PublicBillingCatalogController, QuotaController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({
  controllers: [BillingController, PublicBillingCatalogController, QuotaController],
  providers: [BillingService, ServiceAdminSessionGuard],
  exports: [BillingService]
})
export class BillingModule {}
