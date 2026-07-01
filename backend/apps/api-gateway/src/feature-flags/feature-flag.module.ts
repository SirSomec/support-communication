import { Module } from "@nestjs/common";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { FeatureFlagController } from "./feature-flag.controller.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@Module({
  controllers: [FeatureFlagController],
  providers: [DemoServiceAdminGuard, FeatureFlagService],
  exports: [FeatureFlagService]
})
export class FeatureFlagModule {}
