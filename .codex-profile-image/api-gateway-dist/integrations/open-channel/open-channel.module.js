var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ConversationModule } from "../../conversation/conversation.module.js";
import { IdentityModule } from "../../identity/identity.module.js";
import { QualityModule } from "../../quality/quality.module.js";
import { RoutingModule } from "../../routing/routing.module.js";
import { AutomationModule } from "../../automation/automation.module.js";
import { OpenChannelAdminController } from "./open-channel-admin.controller.js";
import { OpenChannelPublicController } from "./open-channel-public.controller.js";
let OpenChannelModule = class OpenChannelModule {
};
OpenChannelModule = __decorate([
    Module({
        imports: [AutomationModule, ConversationModule, IdentityModule, QualityModule, RoutingModule],
        controllers: [OpenChannelAdminController, OpenChannelPublicController]
    })
], OpenChannelModule);
export { OpenChannelModule };
//# sourceMappingURL=open-channel.module.js.map