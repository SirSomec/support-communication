import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { WorkspaceAuditService, type WorkspaceAuditContext } from "./workspace-audit.service.js";

@ApiTags("audit")
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("audit")
export class WorkspaceAuditController {
  constructor(private readonly workspaceAuditService: WorkspaceAuditService) {}

  @Get("events")
  @RequireTenantOperatorPermission("audit.read")
  @RequireServiceAdminAction("audit.read")
  @ApiOkResponse({ description: "Tenant workspace audit events envelope" })
  fetchWorkspaceAuditEvents(
    @Query() filters: { limit?: number | string; period?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.workspaceAuditService.fetchWorkspaceAuditEvents(filters, auditContextFromRequest(request));
  }
}

function auditContextFromRequest(request: TenantOperatorRequest): WorkspaceAuditContext {
  const serviceAdminContext = (request as TenantOperatorRequest & ServiceAdminRequest).serviceAdminContext;
  const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
  if (!tenantId) {
    return {};
  }
  return {
    actorId: request.tenantOperatorContext?.userId ?? serviceAdminContext?.actor.id,
    tenantId
  };
}
