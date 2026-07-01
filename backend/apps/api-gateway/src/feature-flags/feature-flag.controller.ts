import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { FeatureFlagService } from "./feature-flag.service.js";

@ApiTags("feature-flags")
@UseGuards(DemoServiceAdminGuard)
@Controller("feature-flags")
export class FeatureFlagController {
  constructor(private readonly featureFlagService: FeatureFlagService) {}

  @Get()
  @RequireServiceAdminAction("flags.read")
  @ApiOkResponse({ description: "Feature flag list envelope" })
  fetchFeatureFlags(@Query() filters: { query?: string; scope?: string; status?: string }) {
    return this.featureFlagService.fetchFeatureFlags(filters);
  }

  @Post(":flagId/preview")
  @RequireServiceAdminAction("flags.manage")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Feature flag rollout preview envelope" })
  previewFlagChange(
    @Param("flagId") flagId: string,
    @Body() payload: { nextRollout?: unknown; nextStatus?: "guarded" | "gradual" | "off" | "on"; reason?: string; tenantIds?: string[] }
  ) {
    return this.featureFlagService.previewFlagChange({ ...payload, flagId });
  }

  @Patch(":flagId")
  @RequireServiceAdminAction("flags.manage")
  @ApiOkResponse({ description: "Audited feature flag update envelope" })
  updateFeatureFlag(
    @Param("flagId") flagId: string,
    @Body()
    payload: {
      confirmationText?: string;
      confirmed?: boolean;
      idempotencyKey?: string;
      nextRollout?: unknown;
      nextStatus?: "guarded" | "gradual" | "off" | "on";
      reason?: string;
      tenantIds?: string[];
    },
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: ServiceAdminRequest
  ) {
    return this.featureFlagService.updateFeatureFlag({
      ...payload,
      actor: request.serviceAdminContext?.actor,
      flagId,
      idempotencyKey: idempotencyKey ?? payload.idempotencyKey
    });
  }

  @Post(":flagId/internal-tests")
  @RequireServiceAdminAction("flags.test")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Feature flag internal evaluation test envelope" })
  runInternalFlagTest(
    @Param("flagId") flagId: string,
    @Body() payload: { segment?: string; tenantId?: string }
  ) {
    return this.featureFlagService.runInternalFlagTest({ ...payload, flagId });
  }
}
