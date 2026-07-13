import { Module } from "@nestjs/common";
import { PresenceController } from "./presence.controller.js";
import { OperatorPresenceService } from "./presence.service.js";

@Module({
  controllers: [PresenceController],
  providers: [OperatorPresenceService],
  exports: [OperatorPresenceService]
})
export class PresenceModule {}
