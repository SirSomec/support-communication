var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { AutomationService } from "../automation/automation.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { handleProviderWebhookFromRoute } from "./provider-webhook.route.js";
import { ProviderMessageBindingRepository } from "./provider-message-binding.repository.js";
import { QualityService } from "../quality/quality.service.js";
import { fetchVkUserProfile } from "./vk-user-profile.js";
let ProviderWebhookController = class ProviderWebhookController {
    conversationService;
    automationService;
    qualityService;
    conversations = ConversationRepository.default();
    integrations = IntegrationRepository.default();
    providerMessageBindings = ProviderMessageBindingRepository.default();
    constructor(conversationService = new ConversationService(), automationService = new AutomationService(), qualityService = new QualityService()) {
        this.conversationService = conversationService;
        this.automationService = automationService;
        this.qualityService = qualityService;
    }
    receiveVk(connectionId, body, headers) {
        return handleProviderWebhookFromRoute({ body, channel: "VK", channelConnectionId: connectionId, conversationRepository: this.conversations, conversationService: this.conversationService, headers, integrationRepository: this.integrations, phoneCollectionEnabled: process.env.PROVIDER_PHONE_COLLECTION_ENABLED !== "false", providerMessageBindings: this.providerMessageBindings, recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context), resolveVkUserProfile: fetchVkUserProfile, runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event) });
    }
    receiveMax(connectionId, body, headers) {
        return handleProviderWebhookFromRoute({ body, channel: "MAX", channelConnectionId: connectionId, conversationRepository: this.conversations, conversationService: this.conversationService, headers, integrationRepository: this.integrations, phoneCollectionEnabled: process.env.PROVIDER_PHONE_COLLECTION_ENABLED !== "false", providerMessageBindings: this.providerMessageBindings, recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context), runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event) });
    }
};
__decorate([
    Post("vk/:connectionId"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "VK Callback API ingress" }),
    __param(0, Param("connectionId")),
    __param(1, Body()),
    __param(2, Headers()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProviderWebhookController.prototype, "receiveVk", null);
__decorate([
    Post("max/:connectionId"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "MAX Bot API ingress" }),
    __param(0, Param("connectionId")),
    __param(1, Body()),
    __param(2, Headers()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProviderWebhookController.prototype, "receiveMax", null);
ProviderWebhookController = __decorate([
    ApiTags("webhooks"),
    Controller("webhooks"),
    __metadata("design:paramtypes", [ConversationService,
        AutomationService,
        QualityService])
], ProviderWebhookController);
export { ProviderWebhookController };
//# sourceMappingURL=provider-webhook.controller.js.map