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
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { AutomationService } from "../automation/automation.service.js";
import { ProactiveExposureRepository } from "../automation/proactive-exposure.repository.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { IntegrationRepository } from "./integration.repository.js";
import { resolvePublicApiRequest } from "./public-api-auth.js";
import { identifyPublicClientFromRoute } from "./public-api.route.js";
import { handlePublicSdkCsatFeedbackDeclineFromRoute, handlePublicSdkMessageIngressFromRoute, handlePublicSdkMessagesPollFromRoute, handlePublicSdkQualityRatingFromRoute, resolveOrCreatePublicSdkConversation } from "./public-sdk-messages.route.js";
import { handlePublicSdkPresenceDisconnect, handlePublicSdkPresenceHeartbeat } from "./public-sdk-presence.route.js";
import { handlePublicSdkInvitationAcknowledge, handlePublicSdkInvitationPoll } from "./public-sdk-invitations.route.js";
import { OpenChannelRepository } from "./open-channel/open-channel.repository.js";
import { ExternalBotBridge } from "./open-channel/external-bot.route.js";
import { handleAgentsOnlineStatus, handleWidgetClientInfoFromRoute } from "./open-channel/client-info.route.js";
import { openChannelDeliveryService, resolveAgentsOnline } from "./open-channel/open-channel-public.controller.js";
let PublicApiController = class PublicApiController {
    conversationService;
    routingService;
    qualityService;
    automationService;
    workspaceService;
    conversationRepository = ConversationRepository.default();
    integrationRepository = IntegrationRepository.default();
    proactiveExposureRepository = ProactiveExposureRepository.default();
    lookup = runtimePublicApiKeyLookup();
    constructor(conversationService = new ConversationService(), routingService = new RoutingService(), qualityService = new QualityService(), automationService = new AutomationService(), workspaceService = new WorkspaceService()) {
        this.conversationService = conversationService;
        this.routingService = routingService;
        this.qualityService = qualityService;
        this.automationService = automationService;
        this.workspaceService = workspaceService;
    }
    createPublicSdkUpload(authorization, environment = "production", payload = {}) {
        return this.withPublicSdkWriteAccess(authorization, environment, (tenantId) => this.workspaceService.createUploadDescriptor({ channel: "SDK", fileName: String(payload.fileName ?? ""), mimeType: payload.mimeType, sizeBytes: payload.sizeBytes }, { tenantId }));
    }
    finalizePublicSdkUpload(authorization, fileId, environment = "production", payload = {}) {
        return this.withPublicSdkWriteAccess(authorization, environment, (tenantId) => this.workspaceService.finalizeUpload({ ...payload, fileId }, { tenantId }));
    }
    heartbeatPublicSdkPresence(authorization, environment = "production", payload = {}) {
        return handlePublicSdkPresenceHeartbeat({ authorization, body: payload, environment, lookup: this.lookup,
            repository: this.integrationRepository });
    }
    disconnectPublicSdkPresence(authorization, environment = "production", payload = {}) {
        return handlePublicSdkPresenceDisconnect({ authorization, body: payload, environment, lookup: this.lookup,
            repository: this.integrationRepository });
    }
    pollPublicSdkInvitations(authorization, sessionId, environment = "production") {
        return handlePublicSdkInvitationPoll({ authorization, environment, exposureRepository: this.proactiveExposureRepository,
            integrationRepository: this.integrationRepository, lookup: this.lookup, sessionId });
    }
    acknowledgePublicSdkInvitation(authorization, exposureId, action, environment = "production", payload = {}) {
        if (!["shown", "dismissed", "accepted", "failed"].includes(action)) {
            return { status: "invalid", data: {}, error: { code: "proactive_exposure_action_invalid", message: "Unsupported invitation action." } };
        }
        return handlePublicSdkInvitationAcknowledge({ action, authorization, conversationId: payload.conversationId,
            environment, exposureId, exposureRepository: this.proactiveExposureRepository, failureCode: payload.failureCode,
            integrationRepository: this.integrationRepository, lookup: this.lookup,
            onAccepted: async (exposure) => exposure ? (await resolveOrCreatePublicSdkConversation({
                conversationRepository: this.conversationRepository, externalId: `proactive:${exposure.subjectId}`,
                pageUrl: typeof exposure.segmentSnapshot.page === "string" ? exposure.segmentSnapshot.page : undefined,
                queueId: await this.resolveSdkQueueId(exposure.tenantId, exposure.channelConnectionId), tenantId: exposure.tenantId
            }))?.id ?? null : null,
            sessionId: payload.sessionId });
    }
    identifyPublicClient(authorization, environment = "production", payload = {}) {
        return identifyPublicClientFromRoute(this.lookup, authorization, environment, payload).then(async (response) => {
            if (response.status !== "ok") {
                return response;
            }
            const authContext = response.data?.context;
            const tenantId = String(authContext?.tenantId ?? "").trim();
            if (!tenantId) {
                return response;
            }
            const conversation = await resolveOrCreatePublicSdkConversation({
                conversationRepository: this.conversationRepository,
                externalId: payload.externalId,
                queueId: await this.resolveSdkQueueId(tenantId, authContext?.channelConnectionId),
                tenantId
            });
            return {
                ...response,
                data: {
                    ...response.data,
                    conversationId: conversation?.id ?? null
                }
            };
        });
    }
    sendPublicSdkMessage(authorization, environment = "production", payload = {}) {
        return handlePublicSdkMessageIngressFromRoute({
            authorization,
            autoAssignConversation: (conversationId, tenantId) => this.routingService.autoAssignConversation(conversationId, { tenantId }),
            body: payload,
            conversationRepository: this.conversationRepository,
            conversationService: this.conversationService,
            environment,
            lookup: this.lookup,
            recordProactiveConversion: this.proactiveExposureRepository,
            runBotRuntime: (event) => this.runBotRuntimeWithExternalBridge(event, payload),
            resolveQueueId: (tenantId, channelConnectionId) => this.resolveSdkQueueId(tenantId, channelConnectionId)
        });
    }
    /**
     * An external bot connected through the External Bot API takes priority over
     * the built-in scenario runtime; when it owns the dialog the message is
     * forwarded to the provider and operator auto-assignment is suppressed.
     */
    async runBotRuntimeWithExternalBridge(event, payload) {
        const externalRepository = OpenChannelRepository.default();
        if (await externalRepository.findActiveBotConnectionForChannel(event.tenantId, event.channel)) {
            const conversation = await this.conversationRepository.findConversation(event.conversationId);
            if (conversation && conversation.tenantId === event.tenantId) {
                const bridge = new ExternalBotBridge({
                    agentsOnline: (tenantId) => resolveAgentsOnline(tenantId),
                    delivery: openChannelDeliveryService(),
                    repository: externalRepository
                });
                const handled = await bridge.forwardClientMessage({
                    channel: event.channel,
                    clientId: String(payload.externalId ?? "").trim() || conversation.providerConversationId || conversation.phone || conversation.id,
                    conversation,
                    pageUrl: payload.pageUrl,
                    tenantId: event.tenantId,
                    text: String(payload.text ?? "")
                });
                if (handled) {
                    return { instance: { status: "active" }, outcome: "external_bot" };
                }
            }
        }
        return this.automationService.handleBotRuntimeInboundEvent(event);
    }
    updatePublicSdkClientInfo(authorization, environment = "production", payload = {}) {
        return handleWidgetClientInfoFromRoute({
            authorization,
            body: payload,
            conversationRepository: this.conversationRepository,
            delivery: openChannelDeliveryService(),
            environment,
            lookup: this.lookup
        });
    }
    fetchPublicSdkAgentsStatus(authorization, environment = "production") {
        return handleAgentsOnlineStatus({
            authorization,
            environment,
            lookup: this.lookup,
            resolveAgentsOnline: (tenantId) => resolveAgentsOnline(tenantId)
        });
    }
    recordPublicSdkQualityRating(authorization, conversationId, environment = "production", payload = {}) {
        return handlePublicSdkQualityRatingFromRoute({
            authorization,
            body: payload,
            conversationId,
            conversationRepository: this.conversationRepository,
            environment,
            lookup: this.lookup,
            recordQualityRating: (rating, context) => this.qualityService.recordClientQualityRating(rating, context)
        });
    }
    declinePublicSdkCsatFeedback(authorization, conversationId, environment = "production", payload = {}) {
        return handlePublicSdkCsatFeedbackDeclineFromRoute({
            authorization,
            body: payload,
            conversationId,
            conversationRepository: this.conversationRepository,
            environment,
            lookup: this.lookup
        });
    }
    async resolveSdkQueueId(tenantId, channelConnectionId) {
        if (!channelConnectionId)
            return undefined;
        const connection = await this.integrationRepository.findChannelConnectionAsync(tenantId, channelConnectionId);
        if (!connection || connection.type.toLowerCase() !== "sdk" || connection.status.toLowerCase() !== "active")
            return undefined;
        return connection.routingQueueId || undefined;
    }
    async withPublicSdkWriteAccess(authorization, environment, action) {
        const auth = await resolvePublicApiRequest({ authorization, environment, lookup: this.lookup, requiredScope: "conversations:write" });
        if (!auth.allowed) {
            return { status: "denied", data: {}, error: { code: auth.code, message: "Public API key is not allowed to upload SDK attachments." } };
        }
        return action(auth.context.tenantId);
    }
    pollPublicSdkConversationMessages(authorization, conversationId, visitorSessionToken, since, environment = "production") {
        return handlePublicSdkMessagesPollFromRoute({
            authorization,
            conversationId,
            conversationRepository: this.conversationRepository,
            environment,
            lookup: this.lookup,
            resolveDeliveryAttachments: (attachments, tenantId) => this.conversationService.resolvePublicDeliveryAttachments(attachments, tenantId),
            since,
            visitorSessionToken
        });
    }
};
__decorate([
    Post("sdk/uploads"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "createPublicSdkUpload", summary: "Create a one-time upload descriptor for a public SDK attachment" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "createPublicSdkUpload", null);
__decorate([
    Post("sdk/uploads/:fileId/finalize"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "finalizePublicSdkUpload", summary: "Finalize a public SDK attachment upload before sending it in a conversation" }),
    __param(0, Headers("authorization")),
    __param(1, Param("fileId")),
    __param(2, Query("environment")),
    __param(3, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "finalizePublicSdkUpload", null);
__decorate([
    Post("sdk/presence/heartbeat"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "heartbeatPublicSdkPresence", summary: "Refresh an anonymous SDK visitor presence session" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "heartbeatPublicSdkPresence", null);
__decorate([
    Post("sdk/presence/disconnect"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "disconnectPublicSdkPresence", summary: "Disconnect an SDK visitor presence session" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "disconnectPublicSdkPresence", null);
__decorate([
    Get("sdk/invitations"),
    ApiOperation({ operationId: "pollPublicSdkInvitations", summary: "Poll pending proactive invitations for a live SDK session" }),
    __param(0, Headers("authorization")),
    __param(1, Query("sessionId")),
    __param(2, Query("environment")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "pollPublicSdkInvitations", null);
__decorate([
    Post("sdk/invitations/:exposureId/:action"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "acknowledgePublicSdkInvitation", summary: "Acknowledge a proactive SDK invitation lifecycle event" }),
    __param(0, Headers("authorization")),
    __param(1, Param("exposureId")),
    __param(2, Param("action")),
    __param(3, Query("environment")),
    __param(4, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "acknowledgePublicSdkInvitation", null);
__decorate([
    Post("sdk/identify"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Public SDK identify runtime endpoint; denial envelopes include rate-limit metadata.",
        operationId: "identifyPublicSdkClient",
        summary: "Identify a public SDK client"
    }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    ApiOkResponse({ description: "Public SDK identify envelope guarded by public API key auth" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "identifyPublicClient", null);
__decorate([
    Post("sdk/messages"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Public SDK message ingress endpoint.",
        operationId: "sendPublicSdkMessage",
        summary: "Accept a public SDK message"
    }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    ApiOkResponse({ description: "Public SDK ingress envelope with conversation and visitor session token" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "sendPublicSdkMessage", null);
__decorate([
    Post("sdk/client-info"),
    HttpCode(HttpStatus.OK),
    ApiOperation({
        description: "Widget client card update (sw_api.setContactInfo / setCustomData / setUserToken / setClientAttributes).",
        operationId: "updatePublicSdkClientInfo",
        summary: "Update public SDK visitor client info"
    }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "updatePublicSdkClientInfo", null);
__decorate([
    Get("sdk/agents/status"),
    ApiOperation({
        description: "Whether at least one agent can take chats (sw_api.chatMode).",
        operationId: "fetchPublicSdkAgentsStatus",
        summary: "Fetch public SDK agents online status"
    }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    __param(0, Headers("authorization")),
    __param(1, Query("environment")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "fetchPublicSdkAgentsStatus", null);
__decorate([
    Post("sdk/conversations/:conversationId/ratings"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "recordPublicSdkQualityRating", summary: "Record a public SDK conversation rating" }),
    ApiParam({ name: "conversationId", description: "SDK conversation identifier" }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    ApiOkResponse({ description: "Public SDK quality rating acceptance envelope" }),
    __param(0, Headers("authorization")),
    __param(1, Param("conversationId")),
    __param(2, Query("environment")),
    __param(3, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "recordPublicSdkQualityRating", null);
__decorate([
    Post("sdk/conversations/:conversationId/csat-feedback/decline"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "declinePublicSdkCsatFeedback", summary: "Skip the CSAT feedback comment and unlock a new appeal" }),
    ApiParam({ name: "conversationId", description: "SDK conversation identifier" }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    ApiOkResponse({ description: "Public SDK CSAT feedback decline envelope" }),
    __param(0, Headers("authorization")),
    __param(1, Param("conversationId")),
    __param(2, Query("environment")),
    __param(3, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "declinePublicSdkCsatFeedback", null);
__decorate([
    Get("sdk/conversations/:conversationId/messages"),
    ApiOperation({
        description: "Widget polling endpoint for public SDK operator replies.",
        operationId: "pollPublicSdkMessages",
        summary: "Poll public SDK conversation replies"
    }),
    ApiParam({ name: "conversationId", description: "SDK conversation identifier" }),
    ApiQuery({ name: "visitorSessionToken", required: true, description: "Short-lived signed visitor session token" }),
    ApiQuery({ name: "since", required: false, description: "Optional last seen operator message id" }),
    ApiQuery({ name: "environment", required: false, description: "production or stage public API key environment" }),
    ApiOkResponse({ description: "Public SDK poll envelope with operator reply messages only; ready attachments include short-lived signed download links" }),
    __param(0, Headers("authorization")),
    __param(1, Param("conversationId")),
    __param(2, Query("visitorSessionToken")),
    __param(3, Query("since")),
    __param(4, Query("environment")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], PublicApiController.prototype, "pollPublicSdkConversationMessages", null);
PublicApiController = __decorate([
    ApiTags("public"),
    ApiBearerAuth(),
    Controller("public"),
    __metadata("design:paramtypes", [ConversationService,
        RoutingService,
        QualityService,
        AutomationService,
        WorkspaceService])
], PublicApiController);
export { PublicApiController };
function runtimePublicApiKeyLookup() {
    const integrationRepository = IntegrationRepository.default();
    return {
        async findActiveKeyBySecretHash(secretHash) {
            return integrationRepository.findActiveKeyBySecretHash(secretHash);
        },
        async listActiveKeys() {
            return integrationRepository.listActiveKeys();
        }
    };
}
//# sourceMappingURL=public-api.controller.js.map