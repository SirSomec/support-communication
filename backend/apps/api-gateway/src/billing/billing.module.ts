import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { BillingController, PublicBillingCatalogController, QuotaController, TenantBillingController, YooKassaWebhookController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";

@Module({
  controllers: [BillingController, PublicBillingCatalogController, QuotaController, TenantBillingController, YooKassaWebhookController],
  providers: [BillingService, ServiceAdminSessionGuard, TenantOperatorAuthGuard],
  exports: [BillingService]
})
export class BillingModule {}
