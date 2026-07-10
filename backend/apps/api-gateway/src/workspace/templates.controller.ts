import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("templates")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireTenantOperatorPermission("templates.read")
  @RequireServiceAdminAction("templates.read")
  @ApiOkResponse({ description: "Template library envelope" })
  fetchTemplates(@Query() filters: { operatorId?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchTemplates(filters, tenantContextFromServiceAdminRequest(request));
  }

  @Post()
  @RequireTenantOperatorPermission("templates.write")
  @RequireServiceAdminAction("templates.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Saved template envelope with version and audit metadata" })
  saveTemplate(@Body() payload: { channel: string; id?: string; text: string; title: string; topic: string; version?: number }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.saveTemplate(payload, tenantContextFromServiceAdminRequest(request));
  }
}

function tenantContextFromServiceAdminRequest(request: TenantOperatorRequest & ServiceAdminRequest): WorkspaceRequestContext {
  if (request.tenantOperatorContext?.tenantId) {
    return { tenantId: request.tenantOperatorContext.tenantId };
  }

  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
