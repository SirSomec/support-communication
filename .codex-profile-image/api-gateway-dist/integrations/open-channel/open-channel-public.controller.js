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
import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../../conversation/conversation.repository.js";
import { ConversationService } from "../../conversation/conversation.service.js";
import { RoutingService } from "../../routing/routing.service.js";
import { QualityService } from "../../quality/quality.service.js";
import { AutomationService } from "../../automation/automation.service.js";
import { IdentityRepository } from "../../identity/identity.repository.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import { handleOpenChatInbound, handleOpenChatStatus } from "./open-chat.route.js";
import { ExternalBotBridge, handleExternalBotProviderEvent } from "./external-bot.route.js";
let OpenChannelPublicController = class OpenChannelPublicController {
    conversationService;
    routingService;
    qualityService;
    automationService;
    conversationRepository = ConversationRepository.default();
    repository = OpenChannelRepository.default();
    constructor(conversationService = new ConversationService(), routingService = new RoutingService(), qualityService = new QualityService(), automationService = new AutomationService()) {
        this.conversationService = conversationService;
        this.routingService = routingService;
        this.qualityService = qualityService;
        this.automationService = automationService;
    }
    async receiveOpenChatEvent(channelToken, body, response) {
        const result = await handleOpenChatInbound({
            body: body ?? {},
            botBridge: this.botBridge(),
            channelToken,
            conversationRepository: this.conversationRepository,
            conversationService: this.conversationService,
            recordQualityRating: (payload, context) => this.qualityService.recordClientQualityRating(payload, context),
            runBotRuntime: (event) => this.automationService.handleBotRuntimeInboundEvent(event),
            repository: this.repository
        });
        respond(response, result);
    }
    async fetchOpenChannelStatus(channelToken, response) {
        const result = await handleOpenChatStatus({
            channelToken,
            conversationRepository: this.conversationRepository,
            repository: this.repository
        });
        respond(response, result);
    }
    async receiveExternalBotEvent(connectionId, token, body, response) {
        const result = await handleExternalBotProviderEvent({
            autoAssignConversation: async (conversationId, tenantId) => {
                const assigned = await this.routingService.autoAssignConversation(conversationId, { tenantId });
                return { status: assigned.status };
            },
            body: body ?? {},
            bridge: this.botBridge(),
            connectionId,
            conversationRepository: this.conversationRepository,
            repository: this.repository,
            token
        });
        response.status(result.statusCode).set("content-type", "application/json; charset=utf-8").send(result.body);
    }
    botBridge() {
        return new ExternalBotBridge({
            agentsOnline: (tenantId) => resolveAgentsOnline(tenantId),
            delivery: openChannelDeliveryService(),
            repository: this.repository
        });
    }
};
__decorate([
    Post("open-channel/:channelToken"),
    ApiOperation({
        description: "Open Channel chat ingress: POST {sender, recipient, message} events.",
        operationId: "receiveOpenChatEvent",
        summary: "Receive an Open Channel chat event"
    }),
    ApiParam({ name: "channelToken", description: "Open Channel chat token from the channel settings" }),
    __param(0, Param("channelToken")),
    __param(1, Body()),
    __param(2, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], OpenChannelPublicController.prototype, "receiveOpenChatEvent", null);
__decorate([
    Get("open-channel/:channelToken/status"),
    ApiOperation({
        description: "Open Channel chat status: body is 0 when no active dialogs exist, 1 otherwise.",
        operationId: "fetchOpenChannelStatus",
        summary: "Fetch Open Channel chat status"
    }),
    ApiParam({ name: "channelToken", description: "Chat API channel token" }),
    __param(0, Param("channelToken")),
    __param(1, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OpenChannelPublicController.prototype, "fetchOpenChannelStatus", null);
__decorate([
    Post("external-bot/webhooks/:connectionId/:token"),
    ApiExcludeEndpoint(),
    __param(0, Param("connectionId")),
    __param(1, Param("token")),
    __param(2, Body()),
    __param(3, Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], OpenChannelPublicController.prototype, "receiveExternalBotEvent", null);
OpenChannelPublicController = __decorate([
    ApiTags("open-channel"),
    Controller(),
    __metadata("design:paramtypes", [ConversationService,
        RoutingService,
        QualityService,
        AutomationService])
], OpenChannelPublicController);
export { OpenChannelPublicController };
let sharedDelivery = null;
/** One delivery queue per process so controller instances share the journal. */
export function openChannelDeliveryService() {
    if (!sharedDelivery) {
        sharedDelivery = new OpenChannelDeliveryService({
            conversationRepository: ConversationRepository.default(),
            repository: OpenChannelRepository.default()
        });
    }
    return sharedDelivery;
}
export function resetOpenChannelDeliveryService() {
    sharedDelivery?.stop();
    sharedDelivery = null;
}
/**
 * Presence approximation for agents_online / chatMode: at least one active
 * tenant user. Real per-operator presence lives in the operator app; this
 * stays intentionally cheap for the public endpoint.
 */
export async function resolveAgentsOnline(tenantId) {
    const users = await IdentityRepository.default().findTenantUsers(tenantId);
    return users.some((user) => user.status === "active");
}
function respond(response, result) {
    response.status(result.statusCode).set("content-type", result.contentType).send(result.body);
}
//# sourceMappingURL=open-channel-public.controller.js.map