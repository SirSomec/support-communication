import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { type WorkspaceRequestContext, WorkspaceService } from "./workspace.service.js";

@ApiTags("clients")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireTenantOperatorPermission("clients.read")
  @RequireServiceAdminAction("clients.read")
  @ApiOkResponse({ description: "Client profile list envelope with merge graph" })
  fetchClientProfiles(@Query() filters: { maskSensitive?: string; page?: string; pageSize?: string; segmentId?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchClientProfiles(filters, tenantContextFromRequest(request));
  }

  @Get("segments")
  @RequireTenantOperatorPermission("clients.read")
  @RequireServiceAdminAction("clients.read")
  @ApiOkResponse({ description: "Client segment descriptor envelope" })
  fetchClientSegments(@Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.fetchClientSegments(tenantContextFromRequest(request));
  }

  @Post("exports")
  @RequireTenantOperatorPermission("clients.read")
  @RequireServiceAdminAction("clients.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client export job descriptor envelope" })
  createClientExport(@Body() payload: { format?: string; reason?: string; segmentId?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.createClientExport(payload, tenantContextFromRequest(request));
  }

  @Post("merge")
  @RequireTenantOperatorPermission("clients.merge")
  @RequireServiceAdminAction("clients.merge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client merge audit descriptor envelope" })
  mergeClientProfiles(@Body() payload: { candidateProfileId: string; primaryProfileId: string; reason?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.mergeClientProfiles(payload, tenantContextFromRequest(request));
  }

  @Post("unmerge")
  @RequireTenantOperatorPermission("clients.merge")
  @RequireServiceAdminAction("clients.merge")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Client unmerge audit descriptor envelope" })
  unmergeClientProfile(@Body() payload: { detachedProfileId: string; primaryProfileId: string; reason?: string }, @Req() request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown> {
    return this.workspaceService.unmergeClientProfile(payload, tenantContextFromRequest(request));
  }
}

function tenantContextFromRequest(request: TenantOperatorRequest & ServiceAdminRequest): WorkspaceRequestContext {
  if (request.tenantOperatorContext?.tenantId) {
    return { tenantId: request.tenantOperatorContext.tenantId };
  }

  return request.serviceAdminContext?.currentTenantId ? { tenantId: request.serviceAdminContext.currentTenantId } : {};
}
