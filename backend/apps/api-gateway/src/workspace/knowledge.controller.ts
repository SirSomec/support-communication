import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { WorkspaceService } from "./workspace.service.js";

@ApiTags("knowledge")
@UseGuards(DemoServiceAdminGuard)
@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Knowledge article list envelope" })
  fetchKnowledgeArticles(@Query() filters: { visibility?: string }): Promise<unknown> {
    return this.workspaceService.fetchKnowledgeArticles(filters);
  }

  @Get(":articleId")
  @RequireServiceAdminAction("knowledge.read")
  @ApiOkResponse({ description: "Knowledge article detail envelope with versions and approval history" })
  fetchKnowledgeArticle(@Param("articleId") articleId: string): Promise<unknown> {
    return this.workspaceService.fetchKnowledgeArticle(articleId);
  }

  @Post(":articleId/drafts")
  @RequireServiceAdminAction("knowledge.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Knowledge article draft envelope with version audit" })
  saveKnowledgeArticleDraft(@Param("articleId") articleId: string, @Body() payload: { body: string; reason?: string }): Promise<unknown> {
    return this.workspaceService.saveKnowledgeArticleDraft({ ...payload, articleId });
  }
}
