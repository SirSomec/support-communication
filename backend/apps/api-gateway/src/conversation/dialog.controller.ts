import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { TenantOperatorOrServiceAdminGuard } from "./tenant-operator-or-service-admin.guard.js";

@ApiTags("dialogs")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("dialogs")
export class DialogController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog list envelope with backend-ready pagination" })
  fetchDialogs(
    @Query() filters: { channel?: string; page?: string; pageSize?: string; query?: string; savedPresetId?: string; status?: string; topic?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.conversationService.fetchDialogs(filters, {
      tenantId: request.tenantOperatorContext?.tenantId
    });
  }

  @Post("attachments")
  @RequireTenantOperatorPermission("files.write")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Attachment upload descriptor envelope" })
  uploadAttachment(@Body() payload: { channel: string; fileName: string; sizeBytes?: number }) {
    return this.conversationService.uploadAttachment(payload);
  }

  @Post("outbound")
  @RequireTenantOperatorPermission("outbound.start")
  @RequireServiceAdminAction("outbound.start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Outbound conversation request envelope" })
  createOutboundConversationRequest(@Body() payload: { channel: string; clientName?: string; message: string; phone: string; topic: string }) {
    return this.conversationService.createOutboundConversationRequest(payload);
  }

  @Get(":conversationId")
  @RequireTenantOperatorPermission("dialogs.read")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog detail envelope" })
  fetchDialogDetail(@Param("conversationId") conversationId: string, @Req() request: TenantOperatorRequest) {
    return this.conversationService.fetchDialogDetail(conversationId, {
      tenantId: request.tenantOperatorContext?.tenantId
    });
  }

  @Patch(":conversationId/status")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Dialog status transition envelope" })
  transitionConversationStatus(
    @Param("conversationId") conversationId: string,
    @Body() payload: { nextStatus?: string; roleMode?: string; topic?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.conversationService.transitionConversationStatus({ ...payload, conversationId }, {
      tenantId: request.tenantOperatorContext?.tenantId
    });
  }

  @Post(":conversationId/messages")
  @RequireTenantOperatorPermission("dialogs.manage")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Append reply or internal note envelope" })
  appendMessage(
    @Param("conversationId") conversationId: string,
    @Body() payload: { attachments?: Array<Record<string, unknown>>; mode?: "internal" | "reply"; text?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.conversationService.appendMessage({ ...payload, conversationId }, {
      tenantId: request.tenantOperatorContext?.tenantId
    });
  }
}
