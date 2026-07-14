import { Module } from "@nestjs/common";
import { ConversationModule } from "../../conversation/conversation.module.js";
import { IdentityModule } from "../../identity/identity.module.js";
import { QualityModule } from "../../quality/quality.module.js";
import { RoutingModule } from "../../routing/routing.module.js";
import { OpenChannelAdminController } from "./open-channel-admin.controller.js";
import { OpenChannelPublicController } from "./open-channel-public.controller.js";

@Module({
  imports: [ConversationModule, IdentityModule, QualityModule, RoutingModule],
  controllers: [OpenChannelAdminController, OpenChannelPublicController]
})
export class OpenChannelModule {}
