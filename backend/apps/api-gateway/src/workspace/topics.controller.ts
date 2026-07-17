import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { TopicDirectoryService } from "./topic-directory.service.js";

@ApiTags("workspace")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("workspace/topics")
export class TopicsController {
  constructor(private readonly topicDirectoryService: TopicDirectoryService) {}

  @Get()
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchWorkspaceTopics", summary: "List tenant topic directory" })
  @ApiOkResponse({ description: "Topic directory envelope" })
  fetchTopics(@Query() query: { query?: string; status?: string }, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.fetchTopics(query, topicTenantScope(request));
  }

  @Post()
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createWorkspaceTopic", summary: "Create topic directory entry" })
  @ApiOkResponse({ description: "Created topic envelope" })
  createTopic(@Body() payload: Record<string, unknown>, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.createTopic(payload, topicTenantScope(request));
  }

  @Patch(":topicId")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @ApiOperation({ operationId: "updateWorkspaceTopic", summary: "Update topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Updated topic envelope" })
  updateTopic(@Param("topicId") topicId: string, @Body() payload: Record<string, unknown>, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.updateTopic(topicId, payload, topicTenantScope(request));
  }

  @Post(":topicId/archive")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "archiveWorkspaceTopic", summary: "Archive topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Archived topic envelope" })
  archiveTopic(@Param("topicId") topicId: string, @Body() payload: { reason?: string } = {}, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.archiveTopic(topicId, payload, topicTenantScope(request));
  }

  @Post(":topicId/restore")
  @RequireTenantOperatorPermission("settings.manage")
  @RequireServiceAdminAction("settings.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "restoreWorkspaceTopic", summary: "Restore archived topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Restored topic envelope" })
  restoreTopic(@Param("topicId") topicId: string, @Body() payload: { reason?: string } = {}, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.restoreTopic(topicId, payload, topicTenantScope(request));
  }

  @Get(":topicId/usage")
  @RequireTenantOperatorPermission("settings.read")
  @RequireServiceAdminAction("settings.read")
  @ApiOperation({ operationId: "fetchWorkspaceTopicUsage", summary: "Read topic usage before archive or restore" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Topic usage envelope" })
  fetchTopicUsage(@Param("topicId") topicId: string, @Req() request: TopicDirectoryRequest) {
    return this.topicDirectoryService.fetchTopicUsage(topicId, topicTenantScope(request));
  }
}

type TopicDirectoryRequest = TenantOperatorRequest & ServiceAdminRequest;

function topicTenantScope(request: TopicDirectoryRequest): { tenantId: string } {
  const tenantId = request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId;
  if (!tenantId) {
    throw new Error("topic_tenant_id_required");
  }
  return { tenantId };
}
