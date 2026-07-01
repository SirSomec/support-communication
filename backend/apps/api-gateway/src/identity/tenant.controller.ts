import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";
import { updateTenantStatusFromRoute } from "./tenant.route.js";
import { TenantService } from "./tenant.service.js";

@ApiTags("tenants")
@UseGuards(DemoServiceAdminGuard)
@Controller("tenants")
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @RequireServiceAdminAction("tenants.read")
  @ApiOkResponse({ description: "Tenant list envelope" })
  fetchTenants(@Query() filters: { query?: string; region?: string; status?: string }) {
    return this.tenantService.fetchTenants(filters);
  }

  @Get(":tenantId")
  @RequireServiceAdminAction("tenants.read")
  @ApiOkResponse({ description: "Tenant detail envelope" })
  fetchTenantDetail(@Param("tenantId") tenantId: string) {
    return this.tenantService.fetchTenantDetail(tenantId);
  }

  @Patch(":tenantId/status")
  @RequireServiceAdminAction("tenants.manage")
  @ApiOkResponse({ description: "Tenant status update envelope" })
  updateTenantStatus(
    @Param("tenantId") tenantId: string,
    @Body() payload: { confirmed?: boolean; reason?: string; status: string },
    @Req() request: ServiceAdminRequest
  ) {
    return updateTenantStatusFromRoute(this.tenantService, { ...payload, tenantId }, request);
  }
}
