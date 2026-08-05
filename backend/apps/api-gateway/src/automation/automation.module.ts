import { Module } from "@nestjs/common";
import { AutomationController } from "./automation.controller.js";
import { AutomationService } from "./automation.service.js";
import { BillingModule } from "../billing/billing.module.js";

@Module({
  imports: [BillingModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService]
})
export class AutomationModule {}
