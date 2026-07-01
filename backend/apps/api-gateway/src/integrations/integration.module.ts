import { Module } from "@nestjs/common";
import { IntegrationController } from "./integration.controller.js";
import { IntegrationService } from "./integration.service.js";
import { PublicApiController } from "./public-api.controller.js";

@Module({
  controllers: [IntegrationController, PublicApiController],
  providers: [IntegrationService]
})
export class IntegrationModule {}
