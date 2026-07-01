import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TopicDirectoryService } from "./topic-directory.service.js";

@ApiTags("workspace")
@Controller("workspace/topics")
export class TopicsController {
  constructor(private readonly topicDirectoryService: TopicDirectoryService) {}

  @Get()
  @ApiOperation({ operationId: "fetchWorkspaceTopics", summary: "List tenant topic directory" })
  @ApiOkResponse({ description: "Topic directory envelope" })
  fetchTopics(@Query() query: { query?: string; status?: string; tenantId?: string }) {
    return this.topicDirectoryService.fetchTopics(query);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createWorkspaceTopic", summary: "Create topic directory entry" })
  @ApiOkResponse({ description: "Created topic envelope" })
  createTopic(@Body() payload: Record<string, unknown>) {
    return this.topicDirectoryService.createTopic(payload);
  }

  @Patch(":topicId")
  @ApiOperation({ operationId: "updateWorkspaceTopic", summary: "Update topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Updated topic envelope" })
  updateTopic(@Param("topicId") topicId: string, @Body() payload: Record<string, unknown>) {
    return this.topicDirectoryService.updateTopic(topicId, payload);
  }

  @Post(":topicId/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "archiveWorkspaceTopic", summary: "Archive topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Archived topic envelope" })
  archiveTopic(@Param("topicId") topicId: string, @Body() payload: { reason?: string } = {}) {
    return this.topicDirectoryService.archiveTopic(topicId, payload);
  }

  @Post(":topicId/restore")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "restoreWorkspaceTopic", summary: "Restore archived topic directory entry" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Restored topic envelope" })
  restoreTopic(@Param("topicId") topicId: string, @Body() payload: { reason?: string } = {}) {
    return this.topicDirectoryService.restoreTopic(topicId, payload);
  }

  @Get(":topicId/usage")
  @ApiOperation({ operationId: "fetchWorkspaceTopicUsage", summary: "Read topic usage before archive or restore" })
  @ApiParam({ name: "topicId", description: "Topic identifier" })
  @ApiOkResponse({ description: "Topic usage envelope" })
  fetchTopicUsage(@Param("topicId") topicId: string) {
    return this.topicDirectoryService.fetchTopicUsage(topicId);
  }
}
