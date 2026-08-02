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
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { OperatorAiSuggestionService } from "./operator-ai-suggestion.service.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";
import { ConversationRepository } from "./conversation.repository.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
const MAX_INBOUND_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const TELEGRAM_ATTACHMENT_TIMEOUT_MS = 30_000;
let DialogController = class DialogController {
    conversationService;
    operatorAiSuggestionService;
    conversationRepository = ConversationRepository.default();
    integrationRepository = IntegrationRepository.default();
    constructor(conversationService, operatorAiSuggestionService) {
        this.conversationService = conversationService;
        this.operatorAiSuggestionService = operatorAiSuggestionService;
    }
    fetchDialogs(filters, request) {
        return this.conversationService.fetchDialogs(filters, dialogContextFromRequest(request));
    }
    uploadAttachment(payload, request) {
        return this.conversationService.uploadAttachment(payload, dialogContextFromRequest(request));
    }
    finalizeAttachmentUpload(fileId, payload, request) {
        return this.conversationService.finalizeAttachmentUpload({ ...payload, fileId }, dialogContextFromRequest(request));
    }
    fetchAttachmentUploadStatus(fileId, request) {
        return this.conversationService.fetchAttachmentUploadStatus(fileId, dialogContextFromRequest(request));
    }
    createOutboundConversationRequest(payload, request) {
        return this.conversationService.createOutboundConversationRequest(payload, dialogContextFromRequest(request));
    }
    fetchAssignees(request) {
        return this.conversationService.fetchAssignees(dialogContextFromRequest(request));
    }
    fetchConversationTimeline(conversationId, filters, request) {
        return this.conversationService.fetchConversationTimeline(conversationId, filters, dialogContextFromRequest(request));
    }
    fetchDialogDetail(conversationId, request) {
        return this.conversationService.fetchDialogDetail(conversationId, dialogContextFromRequest(request));
    }
    async downloadInboundTelegramAttachment(conversationId, messageId, attachmentId, request, response) {
        const scope = dialogContextFromRequest(request);
        const conversation = await this.conversationRepository.findConversation(conversationId);
        if (!conversation || !scope.tenantId || conversation.tenantId !== scope.tenantId || conversation.channel.toLowerCase() !== "telegram")
            throw new NotFoundException("Attachment was not found.");
        const message = conversation.messages.find((item) => String(item.id) === String(messageId));
        const attachments = message?.attachments ?? [];
        const index = /^index-(\d+)$/.exec(String(attachmentId))?.[1];
        const attachment = index === undefined ? attachments.find((item) => String(item.providerFileUniqueId ?? "") === String(attachmentId)) : attachments[Number(index)];
        const fileId = String(attachment?.providerFileId ?? "").trim();
        if (!fileId)
            throw new NotFoundException("Attachment was not found.");
        const botId = conversation.tags.find((tag) => tag.startsWith("bot:"))?.slice(4);
        const candidates = (await this.integrationRepository.listTelegramConnectionsAsync()).filter((item) => item.tenantId === scope.tenantId && item.status === "active");
        const connection = botId ? candidates.find((item) => item.botId === botId) : candidates.length === 1 ? candidates[0] : undefined;
        if (!connection?.botToken)
            throw new NotFoundException("Telegram attachment access is unavailable.");
        const apiBase = String(process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").replace(/\/+$/, "");
        const descriptorResponse = await fetch(`${apiBase}/bot${connection.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, {
            signal: AbortSignal.timeout(TELEGRAM_ATTACHMENT_TIMEOUT_MS)
        });
        const descriptor = await descriptorResponse.json();
        const filePath = String(descriptor.result?.file_path ?? "").trim();
        if (!descriptorResponse.ok || !descriptor.ok || !filePath || filePath.includes(".."))
            throw new NotFoundException("Telegram attachment is no longer available.");
        const fileResponse = await fetch(`${apiBase}/file/bot${connection.botToken}/${filePath}`, {
            signal: AbortSignal.timeout(TELEGRAM_ATTACHMENT_TIMEOUT_MS)
        });
        if (!fileResponse.ok)
            throw new NotFoundException("Telegram attachment is no longer available.");
        const contentLength = Number(fileResponse.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength > MAX_INBOUND_ATTACHMENT_BYTES) {
            throw new NotFoundException("Attachment exceeds the download limit.");
        }
        const body = Buffer.from(await fileResponse.arrayBuffer());
        if (body.byteLength > MAX_INBOUND_ATTACHMENT_BYTES)
            throw new NotFoundException("Attachment exceeds the download limit.");
        const fileName = safeAttachmentFileName(String(attachment?.fileName ?? "attachment"));
        response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        response.setHeader("Content-Type", String(attachment?.mimeType ?? fileResponse.headers.get("content-type") ?? "application/octet-stream"));
        return new StreamableFile(body);
    }
    assignConversation(conversationId, payload, request) {
        return this.conversationService.assignConversation({ ...payload, conversationId }, dialogContextFromRequest(request));
    }
    updateConversationTags(conversationId, payload, request) {
        return this.conversationService.updateConversationTags({ ...payload, conversationId }, dialogContextFromRequest(request));
    }
    updateConversationClientPhone(conversationId, payload, request) {
        return this.conversationService.updateConversationClientPhone({ ...payload, conversationId }, dialogContextFromRequest(request));
    }
    transitionConversationStatus(conversationId, payload, request) {
        return this.conversationService.transitionConversationStatus({ ...payload, conversationId }, dialogContextFromRequest(request));
    }
    fetchAiReplySuggestions(conversationId, request) {
        return this.operatorAiSuggestionService.suggest({ conversationId, tenantId: dialogContextFromRequest(request).tenantId });
    }
    appendMessage(conversationId, payload, request) {
        return this.conversationService.appendMessage({ ...payload, conversationId }, dialogContextFromRequest(request));
    }
};
__decorate([
    Get(),
    RequireTenantOperatorPermission("dialogs.read"),
    RequireServiceAdminAction("dialogs.read"),
    ApiOkResponse({ description: "Dialog list envelope with backend-ready pagination" }),
    __param(0, Query()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchDialogs", null);
__decorate([
    Post("attachments"),
    RequireTenantOperatorPermission("files.write"),
    RequireServiceAdminAction("files.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Attachment upload descriptor envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "uploadAttachment", null);
__decorate([
    Post("attachments/:fileId/finalize"),
    RequireTenantOperatorPermission("files.write"),
    RequireServiceAdminAction("files.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Attachment upload finalize envelope" }),
    __param(0, Param("fileId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "finalizeAttachmentUpload", null);
__decorate([
    Get("attachments/:fileId/status"),
    RequireTenantOperatorPermission("files.read"),
    RequireServiceAdminAction("files.read"),
    ApiOkResponse({ description: "Attachment upload status envelope" }),
    __param(0, Param("fileId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchAttachmentUploadStatus", null);
__decorate([
    Post("outbound"),
    RequireTenantOperatorPermission("outbound.start"),
    RequireServiceAdminAction("outbound.start"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Outbound conversation request envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "createOutboundConversationRequest", null);
__decorate([
    Get("assignees"),
    RequireTenantOperatorPermission("dialogs.read"),
    RequireServiceAdminAction("dialogs.read"),
    ApiOkResponse({ description: "Active tenant users available for dialog assignment" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchAssignees", null);
__decorate([
    Get(":conversationId/timeline"),
    RequireTenantOperatorPermission("dialogs.read"),
    RequireServiceAdminAction("dialogs.read"),
    ApiOkResponse({ description: "Immutable conversation lifecycle timeline" }),
    __param(0, Param("conversationId")),
    __param(1, Query()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchConversationTimeline", null);
__decorate([
    Get(":conversationId"),
    RequireTenantOperatorPermission("dialogs.read"),
    RequireServiceAdminAction("dialogs.read"),
    ApiOkResponse({ description: "Dialog detail envelope" }),
    __param(0, Param("conversationId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchDialogDetail", null);
__decorate([
    Get(":conversationId/messages/:messageId/attachments/:attachmentId/download"),
    RequireTenantOperatorPermission("dialogs.read"),
    RequireServiceAdminAction("dialogs.read"),
    __param(0, Param("conversationId")),
    __param(1, Param("messageId")),
    __param(2, Param("attachmentId")),
    __param(3, Req()),
    __param(4, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], DialogController.prototype, "downloadInboundTelegramAttachment", null);
__decorate([
    Patch(":conversationId/assignment"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Assign or transfer a dialog and record routing activity" }),
    __param(0, Param("conversationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "assignConversation", null);
__decorate([
    Patch(":conversationId/tags"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Dialog tags replacement envelope (service tags are preserved)" }),
    __param(0, Param("conversationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "updateConversationTags", null);
__decorate([
    Patch(":conversationId/client-phone"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Manual client phone update for dialogs whose source channel did not provide one" }),
    __param(0, Param("conversationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "updateConversationClientPhone", null);
__decorate([
    Patch(":conversationId/status"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Dialog status transition envelope" }),
    __param(0, Param("conversationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "transitionConversationStatus", null);
__decorate([
    Post(":conversationId/ai-suggestions"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "AI reply suggestions grounded in tenant knowledge sources" }),
    __param(0, Param("conversationId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "fetchAiReplySuggestions", null);
__decorate([
    Post(":conversationId/messages"),
    RequireTenantOperatorPermission("dialogs.manage"),
    RequireServiceAdminAction("dialogs.manage"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Append reply or internal note envelope" }),
    __param(0, Param("conversationId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DialogController.prototype, "appendMessage", null);
DialogController = __decorate([
    ApiTags("dialogs"),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("dialogs"),
    __metadata("design:paramtypes", [ConversationService,
        OperatorAiSuggestionService])
], DialogController);
export { DialogController };
function dialogContextFromRequest(request) {
    const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
    if (request.tenantOperatorContext) {
        return {
            actorId: request.tenantOperatorContext.userId,
            actorName: request.tenantOperatorContext.userId,
            actorType: "operator",
            canViewSensitive: canViewSensitiveFields(request.tenantOperatorContext.permissions),
            tenantId
        };
    }
    if (request.serviceAdminContext?.currentTenantId) {
        return {
            actorId: request.serviceAdminContext.actor.id,
            actorName: request.serviceAdminContext.actor.name,
            actorType: "service_admin",
            canViewSensitive: canViewSensitiveFields(request.serviceAdminContext.permissions),
            tenantId
        };
    }
    return {};
}
function canViewSensitiveFields(permissions) {
    return permissions.includes("*") || permissions.includes("dialogs.manage") || permissions.includes("clients.merge");
}
function safeAttachmentFileName(value) {
    return value.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "attachment";
}
//# sourceMappingURL=dialog.controller.js.map