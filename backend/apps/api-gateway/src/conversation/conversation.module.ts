import { Module } from "@nestjs/common";
import { ChannelController } from "./channel.controller.js";
import { ConversationService } from "./conversation.service.js";
import { DialogController } from "./dialog.controller.js";
import { RealtimeController } from "./realtime.controller.js";

@Module({
  controllers: [ChannelController, DialogController, RealtimeController],
  providers: [ConversationService]
})
export class ConversationModule {}
