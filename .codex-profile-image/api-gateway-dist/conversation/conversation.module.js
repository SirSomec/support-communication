var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from "@nestjs/common";
import { ChannelController } from "./channel.controller.js";
import { ConversationService } from "./conversation.service.js";
import { DialogController } from "./dialog.controller.js";
import { OperatorAiSuggestionService } from "./operator-ai-suggestion.service.js";
import { RealtimeController } from "./realtime.controller.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";
let ConversationModule = class ConversationModule {
};
ConversationModule = __decorate([
    Module({
        controllers: [ChannelController, DialogController, RealtimeController],
        providers: [ConversationService, OperatorAiSuggestionService, TenantOperatorOrServiceAdminGuard],
        exports: [ConversationService]
    })
], ConversationModule);
export { ConversationModule };
//# sourceMappingURL=conversation.module.js.map