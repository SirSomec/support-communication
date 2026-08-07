import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { ServiceAdminRequest } from "./service-admin-auth.js";
import { TenantProvisionService } from "./tenant-provision.service.js";

@ApiTags("tenants")
@Controller("tenants")
export class TenantProvisionController {
  constructor(private readonly tenantProvisionService: TenantProvisionService) {}

  @Post("provision")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Public onboarding tenant provisioning envelope with one-time public SDK key." })
  provisionTenant(
    @Body() payload: {
      admin?: { email?: string; name?: string; password?: string };
      channel?: { domain?: string; type?: string };
      employees?: Array<{ email?: string; name?: string; role?: string; team?: string }>;
      legal?: {
        documentVersion?: string;
        personalDataConsent?: boolean;
        privacyPolicyAcknowledged?: boolean;
        termsAccepted?: boolean;
      };
      plan?: { billingCycle?: string; id?: string; trial?: boolean };
      tenant?: { name?: string; region?: string; slug?: string };
    },
    @Req() request: Partial<ServiceAdminRequest>
  ) {
    const requestedPlanId = String(payload.plan?.id ?? "free").trim().toLowerCase() || "free";
    return this.tenantProvisionService.provisionTenant({
      ...payload,
      plan: {
        billingCycle: "monthly",
        id: requestedPlanId,
        trial: requestedPlanId !== "free"
      }
    }, request);
  }
}
