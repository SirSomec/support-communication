import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { QueueDirectoryService, type QueueDirectoryPayload } from "./queue-directory.service.js";

type QueueDirectoryRequest = TenantOperatorRequest & ServiceAdminRequest;

@ApiTags("routing")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("routing/queues")
export class QueueDirectoryController {
  constructor(private readonly queueDirectoryService: QueueDirectoryService) {}

  @Get()
  @RequireTenantOperatorPermission("routing.read")
  @RequireServiceAdminAction("routing.read")
  @ApiOkResponse({ description: "Tenant queue directory envelope with active member counts" })
  fetchQueues(@Query() query: { status?: string }, @Req() request: QueueDirectoryRequest) {
    return this.queueDirectoryService.fetchQueues(query, queueContextFromRequest(request));
  }

  @Post()
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Created tenant support queue envelope" })
  createQueue(@Body() payload: QueueDirectoryPayload, @Req() request: QueueDirectoryRequest) {
    return this.queueDirectoryService.createQueue(payload, queueContextFromRequest(request));
  }

  @Patch()
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Updated tenant support queue envelope" })
  updateQueueFromBody(@Body() payload: QueueDirectoryPayload, @Req() request: QueueDirectoryRequest) {
    return this.queueDirectoryService.updateQueue(payload.queueId, payload, queueContextFromRequest(request));
  }

  @Patch(":queueId")
  @RequireTenantOperatorPermission("routing.redistribute")
  @RequireServiceAdminAction("routing.redistribute")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Updated tenant support queue envelope" })
  updateQueue(@Param("queueId") queueId: string, @Body() payload: QueueDirectoryPayload, @Req() request: QueueDirectoryRequest) {
    return this.queueDirectoryService.updateQueue(queueId, payload, queueContextFromRequest(request));
  }
}

function queueContextFromRequest(request: QueueDirectoryRequest): { tenantId?: string } {
  return {
    tenantId: request.tenantOperatorContext?.tenantId ?? request.serviceAdminContext?.currentTenantId
  };
}
