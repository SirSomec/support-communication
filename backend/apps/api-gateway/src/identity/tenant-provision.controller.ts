import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";
import { TenantProvisionService } from "./tenant-provision.service.js";

@ApiTags("tenants")
@UseGuards(DemoServiceAdminGuard)
@Controller("tenants")
export class TenantProvisionController {
  constructor(private readonly tenantProvisionService: TenantProvisionService) {}

  @Post("provision")
  @HttpCode(HttpStatus.OK)
  @RequireServiceAdminAction("tenants.manage")
  @ApiOkResponse({ description: "Tenant provisioning envelope with one-time public SDK key." })
  provisionTenant(
    @Body() payload: {
      admin?: { email?: string; name?: string; password?: string };
      channel?: { domain?: string; type?: string };
      plan?: { id?: string; trial?: boolean };
      tenant?: { name?: string; region?: string; slug?: string };
    },
    @Req() request: ServiceAdminRequest
  ) {
    return this.tenantProvisionService.provisionTenant(payload, request);
  }
}
