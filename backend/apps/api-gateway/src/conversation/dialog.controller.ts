import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { ConversationService } from "./conversation.service.js";

@ApiTags("dialogs")
@UseGuards(DemoServiceAdminGuard)
@Controller("dialogs")
export class DialogController {
  constructor(private readonly conversationService: ConversationService) {}

  @Get()
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog list envelope with backend-ready pagination" })
  fetchDialogs(@Query() filters: { channel?: string; page?: string; pageSize?: string; query?: string; savedPresetId?: string; status?: string; topic?: string }) {
    return this.conversationService.fetchDialogs(filters);
  }

  @Post("attachments")
  @RequireServiceAdminAction("files.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Attachment upload descriptor envelope" })
  uploadAttachment(@Body() payload: { channel: string; fileName: string; sizeBytes?: number }) {
    return this.conversationService.uploadAttachment(payload);
  }

  @Post("outbound")
  @RequireServiceAdminAction("outbound.start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Outbound conversation request envelope" })
  createOutboundConversationRequest(@Body() payload: { channel: string; clientName?: string; message: string; phone: string; topic: string }) {
    return this.conversationService.createOutboundConversationRequest(payload);
  }

  @Get(":conversationId")
  @RequireServiceAdminAction("dialogs.read")
  @ApiOkResponse({ description: "Dialog detail envelope" })
  fetchDialogDetail(@Param("conversationId") conversationId: string) {
    return this.conversationService.fetchDialogDetail(conversationId);
  }

  @Patch(":conversationId/status")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Dialog status transition envelope" })
  transitionConversationStatus(
    @Param("conversationId") conversationId: string,
    @Body() payload: { nextStatus?: string; roleMode?: string; topic?: string }
  ) {
    return this.conversationService.transitionConversationStatus({ ...payload, conversationId });
  }

  @Post(":conversationId/messages")
  @RequireServiceAdminAction("dialogs.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Append reply or internal note envelope" })
  appendMessage(
    @Param("conversationId") conversationId: string,
    @Body() payload: { attachments?: Array<Record<string, unknown>>; mode?: "internal" | "reply"; text?: string }
  ) {
    return this.conversationService.appendMessage({ ...payload, conversationId });
  }
}
