import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { KnowledgeSourcesService, type KnowledgeSourceCreateInput } from "./knowledge-sources.service.js";

@ApiTags("knowledge-sources")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("knowledge-sources")
export class KnowledgeSourcesController {
  constructor(private readonly service: KnowledgeSourcesService) {}
  @Get()
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Tenant-scoped knowledge source catalog" })
  list(@Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.list(tenantId(request)); }
  @Post()
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  create(@Body() body: KnowledgeSourceCreateInput, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.create(tenantId(request), body ?? {}); }
  // Статические сегменты «bulk/...» объявлены раньше «:sourceId», иначе «bulk» матчился бы как sourceId.
  @Post("bulk/approve")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  bulkApprove(@Body() body: { sourceIds?: string[] }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.applyBulk(tenantId(request), "approve", body ?? {}); }
  @Post("bulk/disable")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  bulkDisable(@Body() body: { sourceIds?: string[] }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.applyBulk(tenantId(request), "disable", body ?? {}); }
  @Post("bulk/enable")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  bulkEnable(@Body() body: { sourceIds?: string[] }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.applyBulk(tenantId(request), "enable", body ?? {}); }
  @Post("bulk/archive")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  bulkArchive(@Body() body: { sourceIds?: string[] }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.applyBulk(tenantId(request), "archive", body ?? {}); }
  @Post("bulk/delete")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  bulkDelete(@Body() body: { sourceIds?: string[] }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.applyBulk(tenantId(request), "delete", body ?? {}); }
  @Post(":sourceId/disable")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  disable(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.disable(tenantId(request), sourceId); }
  @Post(":sourceId/refresh")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  refreshUrl(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.refreshUrl(tenantId(request), sourceId); }
  @Post(":sourceId/refresh-document")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  refreshDocument(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.refreshDocument(tenantId(request), sourceId); }
  @Post(":sourceId/attachments")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  enqueueAttachment(@Param("sourceId") sourceId: string, @Body() body: { fileId?: string; idempotencyKey?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.enqueueAttachmentIngestion(tenantId(request), sourceId, body ?? {}); }
  @Post(":sourceId/approve")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  approve(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.approve(tenantId(request), sourceId); }
  @Patch(":sourceId")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  update(@Param("sourceId") sourceId: string, @Body() body: { title?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.update(tenantId(request), sourceId, body ?? {}); }
  @Post(":sourceId/enable")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  enable(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.enable(tenantId(request), sourceId); }
  @Post(":sourceId/archive")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  archive(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.archive(tenantId(request), sourceId); }
  @Delete(":sourceId")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  remove(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.remove(tenantId(request), sourceId); }
  @Get(":sourceId/preview")
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  preview(@Param("sourceId") sourceId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest) { return this.service.preview(tenantId(request), sourceId); }
}

function tenantId(request: TenantOperatorRequest & ServiceAdminRequest): string {
  return request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId ?? "";
}
