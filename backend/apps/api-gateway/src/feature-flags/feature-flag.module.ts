import { Module } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { FeatureFlagController } from "./feature-flag.controller.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@Module({
  controllers: [FeatureFlagController],
  providers: [ServiceAdminSessionGuard, FeatureFlagService],
  exports: [FeatureFlagService]
})
export class FeatureFlagModule {}
