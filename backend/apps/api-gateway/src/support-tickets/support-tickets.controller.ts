import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { ServiceAdminSessionGuard } from "../identity/service-admin-session.guard.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { SupportTicketsService } from "./support-tickets.service.js";

@UseGuards(TenantOperatorAuthGuard)
@Controller("support-tickets")
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService, private readonly workspace: WorkspaceService) {}

  @Get()
  list(@Req() request: TenantOperatorRequest) { return this.service.listForRequester(request.tenantOperatorContext!); }

  @Get(":ticketId")
  detail(@Param("ticketId") ticketId: string, @Req() request: TenantOperatorRequest) { return this.service.detailForRequester(ticketId, request.tenantOperatorContext!); }

  @Post()
  @HttpCode(HttpStatus.OK)
  create(@Body() payload: { attachments?: unknown[]; body?: string; subject?: string }, @Req() request: TenantOperatorRequest) {
    return this.service.create(payload, request.tenantOperatorContext!);
  }

  @Post(":ticketId/messages")
  @HttpCode(HttpStatus.OK)
  reply(@Param("ticketId") ticketId: string, @Body() payload: { attachments?: unknown[]; body?: string }, @Req() request: TenantOperatorRequest) {
    return this.service.replyFromRequester(ticketId, payload, request.tenantOperatorContext!);
  }

  @Post("attachments")
  @HttpCode(HttpStatus.OK)
  upload(@Body() payload: { fileName: string; mimeType?: string; sizeBytes?: number }, @Req() request: TenantOperatorRequest) {
    return this.workspace.createUploadDescriptor({ ...payload, channel: "SUPPORT" }, { tenantId: request.tenantOperatorContext!.tenantId });
  }

  @Post("attachments/:fileId/finalize")
  @HttpCode(HttpStatus.OK)
  finalize(@Param("fileId") fileId: string, @Body() payload: { checksum?: string }, @Req() request: TenantOperatorRequest) {
    return this.workspace.finalizeUpload({ ...payload, fileId }, { tenantId: request.tenantOperatorContext!.tenantId });
  }

  @Get("attachments/:fileId/status")
  status(@Param("fileId") fileId: string, @Req() request: TenantOperatorRequest) {
    return this.workspace.getUploadStatus(fileId, { tenantId: request.tenantOperatorContext!.tenantId });
  }
}

@UseGuards(ServiceAdminSessionGuard)
@Controller("service-admin/support-tickets")
export class SupportTicketsAdminController {
  constructor(private readonly service: SupportTicketsService, private readonly workspace: WorkspaceService) {}

  @Get()
  @RequireServiceAdminAction("support-tickets.read")
  list(@Query() filters: { status?: string; query?: string }) { return this.service.listForAdmin(filters); }

  @Get(":ticketId")
  @RequireServiceAdminAction("support-tickets.read")
  detail(@Param("ticketId") ticketId: string) { return this.service.detailForAdmin(ticketId); }

  @Get(":ticketId/attachments/:fileId/download-policy")
  @RequireServiceAdminAction("support-tickets.read")
  async attachmentDownloadPolicy(@Param("ticketId") ticketId: string, @Param("fileId") fileId: string) {
    const tenantId = await this.service.attachmentTenantForAdmin(ticketId, fileId);
    if (!tenantId) throw new NotFoundException("Support ticket attachment was not found.");
    return this.workspace.getDownloadPolicy(fileId, { canDownload: true, tenantId });
  }

  @Post(":ticketId/messages")
  @RequireServiceAdminAction("support-tickets.write")
  @HttpCode(HttpStatus.OK)
  reply(@Param("ticketId") ticketId: string, @Body() payload: { body?: string; status?: string }, @Req() request: ServiceAdminRequest) {
    return this.service.replyFromAdmin(ticketId, payload, request.serviceAdminContext?.actor);
  }

  @Put(":ticketId/status")
  @RequireServiceAdminAction("support-tickets.write")
  @HttpCode(HttpStatus.OK)
  changeStatus(@Param("ticketId") ticketId: string, @Body() payload: { status?: string }, @Req() request: ServiceAdminRequest) {
    return this.service.changeStatus(ticketId, payload.status, request.serviceAdminContext?.actor);
  }
}
