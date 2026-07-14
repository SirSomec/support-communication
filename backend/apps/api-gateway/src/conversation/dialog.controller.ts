import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { OperatorAiSuggestionService } from "./operator-ai-suggestion.service.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";

@ApiTags("dialogs")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("dialogs")
export class DialogController {
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
  tenantId?: string;
} {
  const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
  if (request.tenantOperatorContext) {
    return {
      actorId: request.tenantOperatorContext.userId,
      actorName: request.tenantOperatorContext.userId,
      actorType: "operator",
      tenantId
    };
  }
  if (request.serviceAdminContext?.currentTenantId) {
    return {
      actorId: request.serviceAdminContext.actor.id,
      actorName: request.serviceAdminContext.actor.name,
      actorType: "service_admin",
      tenantId
    };
  }
  return {};
}
