import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("knowledge")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  createKnowledgeArticle(@Body() payload: { body?: string; category?: string; channels?: string[]; title?: string; topics?: string[]; visibility?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.createKnowledgeArticle(payload, tenantContextFromRequest(request));
  }

  @Get()
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Knowledge article list envelope" })
  fetchKnowledgeArticles(@Query() filters: { visibility?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchKnowledgeArticles(filters, tenantContextFromRequest(request));
  }

  @Get(":articleId")
  @RequireTenantOperatorPermission("knowledge.read")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Knowledge article detail envelope with versions and approval history" })
  fetchKnowledgeArticle(@Param("articleId") articleId: string, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchKnowledgeArticle(articleId, tenantContextFromRequest(request));
  }

  @Post(":articleId/drafts")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article draft envelope with version audit" })
  saveKnowledgeArticleDraft(
    @Param("articleId") articleId: string,
    @Body()
    payload: {
      body: string;
      category?: string;
      channels?: string[];
      reason?: string;
      title?: string;
      topics?: string[];
      visibility?: string;
    },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.saveKnowledgeArticleDraft({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/submit-review")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article review submission envelope" })
  submitKnowledgeArticleForReview(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; draftId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.submitKnowledgeArticleForReview({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/approve")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article approval envelope" })
  approveKnowledgeArticle(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; draftId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.approveKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/publish")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article publication envelope" })
  publishKnowledgeArticle(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; draftId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.publishKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/reject")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article rejection envelope" })
  rejectKnowledgeArticle(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; draftId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.rejectKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/archive")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article archive envelope" })
  archiveKnowledgeArticle(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; draftId?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.archiveKnowledgeArticle({ ...payload, articleId }, tenantContextFromRequest(request));
  }

  @Post(":articleId/attachments")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article attachment descriptor envelope" })
  addKnowledgeArticleAttachment(
    @Param("articleId") articleId: string,
    @Body() payload: { actor?: string; attachment?: Record<string, unknown>; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.addKnowledgeArticleAttachment({ actor: payload.actor, articleId, attachment: payload.attachment ?? {}, reason: payload.reason }, tenantContextFromRequest(request));
  }

  @Delete(":articleId/attachments/:attachmentId")
  @RequireTenantOperatorPermission("knowledge.write")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article attachment delete envelope" })
  deleteKnowledgeArticleAttachment(
    @Param("articleId") articleId: string,
    @Param("attachmentId") attachmentId: string,
    @Body() payload: { actor?: string; reason?: string },
    @Req() request: TenantOperatorRequest & ServiceAdminRequest
  ): Promise<unknown> {
    return this.workspaceService.deleteKnowledgeArticleAttachment({ ...payload, articleId, attachmentId }, tenantContextFromRequest(request));
  }
}

function tenantContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): WorkspaceRequestContext {
  if (request.tenantOperatorContext?.tenantId) {
    return { tenantId: request.tenantOperatorContext.tenantId };
  }

  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
