import { Module } from "@nestjs/common";
import { MarketingController } from "./marketing.controller.js";
import { MarketingInboundController } from "./marketing-inbound.controller.js";
import { MarketingService } from "./marketing.service.js";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";

@Module({
  controllers: [MarketingController, MarketingInboundController],
  providers: [MarketingService, TenantOperatorAuthGuard],
  exports: [MarketingService]
})
export class MarketingModule {}
