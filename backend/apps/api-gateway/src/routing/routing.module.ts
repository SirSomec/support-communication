import { Module } from "@nestjs/common";
import { RoutingController } from "./routing.controller.js";
import { RoutingService } from "./routing.service.js";

@Module({
  controllers: [RoutingController],
  providers: [RoutingService]
})
export class RoutingModule {}
