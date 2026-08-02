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
import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { AutomationService } from "../automation/automation.service.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { handleTelegramWebhookFromRoute } from "./telegram-webhook.route.js";
let TelegramWebhookController = class TelegramWebhookController {
    conversationService;
    routingService;
    qualityService;
    automationService;
    conversationRepository = ConversationRepository.default();
    integrationRepository = IntegrationRepository.default();
    constructor(conversationService = new ConversationService(), routingService = new RoutingService(), qualityService = new QualityService(), automationService = new AutomationService()) {
        this.conversationService = conversationService;
        this.routingService = routingService;
        this.qualityService = qualityService;
        this.automationService = automationService;
    }
    receiveTelegramWebhook(body, headers) {
        return handleTelegramWebhookFromRoute({
            autoAssignConversation: (conversationId, tenantId) => this.routingService.autoAssignConversation(conversationId, { tenantId }),
            body,
            conversationRepository: this.conversationRepository,
            conversationService: this.conversationService,
            headers,
            integrationRepository: this.integrationRepository,
            recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context),
            runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event),
            telegramApi: { apiBaseUrl: String(process.env.TELEGRAM_API_BASE_URL ?? "").trim() || undefined }
        });
    }
};
__decorate([
    Post("telegram"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Telegram Bot API webhook ingress envelope" }),
    __param(0, Body()),
    __param(1, Headers()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TelegramWebhookController.prototype, "receiveTelegramWebhook", null);
TelegramWebhookController = __decorate([
    ApiTags("webhooks"),
    Controller("webhooks"),
    __metadata("design:paramtypes", [ConversationService,
        RoutingService,
        QualityService,
        AutomationService])
], TelegramWebhookController);
export { TelegramWebhookController };
//# sourceMappingURL=telegram-webhook.controller.js.map