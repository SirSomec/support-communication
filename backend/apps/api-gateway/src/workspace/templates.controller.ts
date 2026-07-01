import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("templates")
@UseGuards(DemoServiceAdminGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireServiceAdminAction("templates.read")
  @ApiOkResponse({ description: "Template library envelope" })
  fetchTemplates(@Query() filters: { operatorId?: string }, @Req() request: ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchTemplates(filters, tenantContextFromServiceAdminRequest(request));
  }

  @Post()
  @RequireServiceAdminAction("templates.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Saved template envelope with version and audit metadata" })
  saveTemplate(@Body() payload: { channel: string; id?: string; text: string; title: string; topic: string; version?: number }, @Req() request: ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.saveTemplate(payload, tenantContextFromServiceAdminRequest(request));
  }
}

function tenantContextFromServiceAdminRequest(request: ServiceAdminRequest): WorkspaceRequestContext {
  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
