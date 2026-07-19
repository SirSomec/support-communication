import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Patch, Post, Query, Req, Res, StreamableFile, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { OperatorAiSuggestionService } from "./operator-ai-suggestion.service.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";
import { ConversationRepository } from "./conversation.repository.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";

const MAX_INBOUND_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const TELEGRAM_ATTACHMENT_TIMEOUT_MS = 30_000;

@ApiTags("dialogs")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("dialogs")
export class DialogController {
  private readonly conversationRepository = ConversationRepository.default();
  private readonly integrationRepository = IntegrationRepository.default();
  constructor(
    private readonly conversationService: ConversationService,
    private readonly operatorAiSuggestionService: OperatorAiSuggestionService
  ) {}

  @Get()
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog list envelope with backend-ready pagination" })
  fetchDialogs(
    @Query() filters: { channel?: string; page?: string; pageSize?: string; query?: string; queueId?: string; savedPresetId?: string; status?: string; teamId?: string; topic?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.fetchDialogs(filters, dialogContextFromRequest(request));
  }

  @Post("attachments")
  @RequireTenantOperatorPermission("files.write")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Attachment upload descriptor envelope" })
  uploadAttachment(
    @Body() payload: { channel: string; fileName: string; mimeType?: string; sizeBytes?: number },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.uploadAttachment(payload, dialogContextFromRequest(request));
  }

  @Post("attachments/:fileId/finalize")
  @RequireTenantOperatorPermission("files.write")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Attachment upload finalize envelope" })
  finalizeAttachmentUpload(
    @Param("fileId") fileId: string,
    @Body() payload: { checksum?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.finalizeAttachmentUpload({ ...payload, fileId }, dialogContextFromRequest(request));
  }

  @Get("attachments/:fileId/status")
  @RequireTenantOperatorPermission("files.read")
  @RequireServiceAdminAction("files.read")
  @ApiOkResponse({ description: "Attachment upload status envelope" })
  fetchAttachmentUploadStatus(@Param("fileId") fileId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.conversationService.fetchAttachmentUploadStatus(fileId, dialogContextFromRequest(request));
  }

  @Post("outbound")
  @RequireTenantOperatorPermission("outbound.start")
  @RequireServiceAdminAction("outbound.start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Outbound conversation request envelope" })
  createOutboundConversationRequest(
    @Body() payload: { channel: string; clientName?: string; message: string; phone: string; topic: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.createOutboundConversationRequest(payload, dialogContextFromRequest(request));
  }

  @Get("assignees")
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Active tenant users available for dialog assignment" })
  fetchAssignees(@Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.conversationService.fetchAssignees(dialogContextFromRequest(request));
  }

  @Get(":conversationId/timeline")
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Immutable conversation lifecycle timeline" })
  fetchConversationTimeline(
    @Param("conversationId") conversationId: string,
    @Query() filters: { cursor?: string; limit?: string; types?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.fetchConversationTimeline(conversationId, filters, dialogContextFromRequest(request));
  }

  @Get(":conversationId")
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog detail envelope" })
  fetchDialogDetail(@Param("conversationId") conversationId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.conversationService.fetchDialogDetail(conversationId, dialogContextFromRequest(request));
  }

  @Get(":conversationId/messages/:messageId/attachments/:attachmentId/download")
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  async downloadInboundTelegramAttachment(
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Param("attachmentId") attachmentId: string,
    @Req() request: TenantOperatorRequest & ServiceAdminRequest,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void }
  ): Promise<StreamableFile> {
    const scope = dialogContextFromRequest(request);
    const conversation = await this.conversationRepository.findConversation(conversationId);
    if (!conversation || !scope.tenantId || conversation.tenantId !== scope.tenantId || conversation.channel.toLowerCase() !== "telegram") throw new NotFoundException("Attachment was not found.");
    const message = conversation.messages.find((item) => String(item.id) === String(messageId));
    const attachments = message?.attachments ?? [];
    const index = /^index-(\d+)$/.exec(String(attachmentId))?.[1];
    const attachment = index === undefined ? attachments.find((item) => String(item.providerFileUniqueId ?? "") === String(attachmentId)) : attachments[Number(index)];
    const fileId = String(attachment?.providerFileId ?? "").trim();
    if (!fileId) throw new NotFoundException("Attachment was not found.");
    const botId = conversation.tags.find((tag) => tag.startsWith("bot:"))?.slice(4);
    const candidates = (await this.integrationRepository.listTelegramConnectionsAsync()).filter((item) => item.tenantId === scope.tenantId && item.status === "active");
    const connection = botId ? candidates.find((item) => item.botId === botId) : candidates.length === 1 ? candidates[0] : undefined;
    if (!connection?.botToken) throw new NotFoundException("Telegram attachment access is unavailable.");
    const apiBase = String(process.env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").replace(/\/+$/, "");
    const descriptorResponse = await fetch(`${apiBase}/bot${connection.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(TELEGRAM_ATTACHMENT_TIMEOUT_MS)
    });
    const descriptor = await descriptorResponse.json() as { ok?: boolean; result?: { file_path?: string } };
    const filePath = String(descriptor.result?.file_path ?? "").trim();
    if (!descriptorResponse.ok || !descriptor.ok || !filePath || filePath.includes("..")) throw new NotFoundException("Telegram attachment is no longer available.");
    const fileResponse = await fetch(`${apiBase}/file/bot${connection.botToken}/${filePath}`, {
      signal: AbortSignal.timeout(TELEGRAM_ATTACHMENT_TIMEOUT_MS)
    });
    if (!fileResponse.ok) throw new NotFoundException("Telegram attachment is no longer available.");
    const contentLength = Number(fileResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_INBOUND_ATTACHMENT_BYTES) {
      throw new NotFoundException("Attachment exceeds the download limit.");
    }
    const body = Buffer.from(await fileResponse.arrayBuffer());
    if (body.byteLength > MAX_INBOUND_ATTACHMENT_BYTES) throw new NotFoundException("Attachment exceeds the download limit.");
    const fileName = safeAttachmentFileName(String(attachment?.fileName ?? "attachment"));
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.setHeader("Content-Type", String(attachment?.mimeType ?? fileResponse.headers.get("content-type") ?? "application/octet-stream"));
    return new StreamableFile(body);
  }

  @Patch(":conversationId/assignment")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Assign or transfer a dialog and record routing activity" })
  assignConversation(
    @Param("conversationId") conversationId: string,
    @Body() payload: { operatorId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.assignConversation({ ...payload, conversationId }, dialogContextFromRequest(request));
  }

  @Patch(":conversationId/tags")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Dialog tags replacement envelope (service tags are preserved)" })
  updateConversationTags(
    @Param("conversationId") conversationId: string,
    @Body() payload: { tags?: string[] },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.updateConversationTags({ ...payload, conversationId }, dialogContextFromRequest(request));
  }

  @Patch(":conversationId/client-phone")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Manual client phone update for dialogs whose source channel did not provide one" })
  updateConversationClientPhone(
    @Param("conversationId") conversationId: string,
    @Body() payload: { phone?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.updateConversationClientPhone({ ...payload, conversationId }, dialogContextFromRequest(request));
  }

  @Patch(":conversationId/status")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Dialog status transition envelope" })
  transitionConversationStatus(
    @Param("conversationId") conversationId: string,
    @Body() payload: { nextStatus?: string; reason?: string; resolutionOutcome?: string; roleMode?: string; topic?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.transitionConversationStatus({ ...payload, conversationId }, dialogContextFromRequest(request));
  }

  @Post(":conversationId/ai-suggestions")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "AI reply suggestions grounded in tenant knowledge sources" })
  fetchAiReplySuggestions(@Param("conversationId") conversationId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) {
    return this.operatorAiSuggestionService.suggest({ conversationId, tenantId: dialogContextFromRequest(request).tenantId });
  }

  @Post(":conversationId/messages")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Append reply or internal note envelope" })
  appendMessage(
    @Param("conversationId") conversationId: string,
    @Body() payload: { attachments?: Array<Record<string, unknown>>; mode?: "internal" | "reply"; text?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ) {
    return this.conversationService.appendMessage({ ...payload, conversationId }, dialogContextFromRequest(request));
  }
}

function dialogContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): {
  actorId?: string;
  actorName?: string;
  actorType?: "operator" | "service_admin";
  canViewSensitive?: boolean;
  tenantId?: string;
} {
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

function canViewSensitiveFields(permissions: string[]): boolean {
  return permissions.includes("*") || permissions.includes("dialogs.manage") || permissions.includes("clients.merge");
}

function safeAttachmentFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "attachment";
}
