import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { DemoServiceAdminGuard } from "../identity/demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { requestServiceAdminBreakGlassApprovalFromRoute, startServiceAdminImpersonationFromRoute } from "./service-admin.route.js";
import { ServiceAdminService } from "./service-admin.service.js";

interface UserActionBody {
  confirmed?: boolean;
  reason?: string;
}

interface ImpersonationBody {
  approvalId?: string;
  confirmed?: boolean;
  durationMinutes?: number;
  mode?: string;
  reason?: string;
  tenantId?: string;
  userId?: string;
  writeAccess?: boolean;
}

interface BreakGlassBody {
  action?: string;
  confirmed?: boolean;
  durationMinutes?: number;
  reason?: string;
  target?: string;
  tenantId?: string;
  userId?: string;
}

interface BreakGlassDecisionBody {
  confirmed?: boolean;
  decision?: string;
  reason?: string;
}

@ApiTags("service-admin")
@UseGuards(DemoServiceAdminGuard)
@Controller("service-admin")
export class ServiceAdminController {
  constructor(private readonly serviceAdminService: ServiceAdminService) {}

  @Get("users")
  @RequireServiceAdminAction("service-admin.users.read")
  @ApiOkResponse({ description: "Service-admin user support workspace envelope" })
  fetchSupportUsers(@Query() filters: { query?: string; status?: string; tenantId?: string }) {
    return this.serviceAdminService.fetchSupportUsers(filters);
  }

  @Post("users/:userId/2fa-reset")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin MFA reset envelope" })
  resetTwoFactor(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.resetTwoFactor({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/mfa/reset")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin MFA reset envelope" })
  resetMfaAlias(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.resetTwoFactor({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/force-logout")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin forced logout envelope" })
  forceLogout(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.forceLogout({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/sessions/logout")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin forced logout envelope" })
  forceLogoutAlias(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.forceLogout({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/block")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin user block envelope" })
  blockUser(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.blockUser({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/unblock")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin user unblock envelope" })
  unblockUser(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.unblockUser({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("users/:userId/invite/resend")
  @RequireServiceAdminAction("service-admin.users.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin invite resend envelope" })
  resendInvite(@Param("userId") userId: string, @Body() payload: UserActionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.resendInvite({ ...payload, actor: request.serviceAdminContext?.actor, userId });
  }

  @Post("impersonations/start")
  @RequireServiceAdminAction("impersonation.start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin impersonation start envelope" })
  startImpersonation(@Body() payload: ImpersonationBody, @Req() request: ServiceAdminRequest) {
    return startServiceAdminImpersonationFromRoute(this.serviceAdminService, payload, request);
  }

  @Post("impersonations")
  @RequireServiceAdminAction("impersonation.start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Service-admin impersonation start envelope" })
  startImpersonationAlias(@Body() payload: ImpersonationBody, @Req() request: ServiceAdminRequest) {
    return startServiceAdminImpersonationFromRoute(this.serviceAdminService, payload, request);
  }

  @Post("impersonations/:impersonationId/stop")
  @RequireServiceAdminAction("impersonation.stop")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Impersonation stop envelope" })
  stopImpersonation(@Param("impersonationId") impersonationId: string, @Body() payload: { reason?: string }, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.stopImpersonation({ ...payload, actor: request.serviceAdminContext?.actor, impersonationId });
  }

  @Post("break-glass/approvals")
  @RequireServiceAdminAction("break-glass.request")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Break-glass approval request envelope" })
  requestBreakGlassApproval(@Body() payload: BreakGlassBody, @Req() request: ServiceAdminRequest) {
    return requestServiceAdminBreakGlassApprovalFromRoute(this.serviceAdminService, payload, request);
  }

  @Post("break-glass-approvals")
  @RequireServiceAdminAction("break-glass.request")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Break-glass approval request envelope" })
  requestBreakGlassApprovalAlias(@Body() payload: BreakGlassBody, @Req() request: ServiceAdminRequest) {
    return requestServiceAdminBreakGlassApprovalFromRoute(this.serviceAdminService, payload, request);
  }

  @Post("break-glass/approvals/:approvalId/decision")
  @RequireServiceAdminAction("break-glass.decide")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Break-glass approval decision envelope" })
  decideBreakGlassApproval(@Param("approvalId") approvalId: string, @Body() payload: BreakGlassDecisionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.decideBreakGlassApproval({ ...payload, actor: request.serviceAdminContext?.actor, approvalId });
  }

  @Post("break-glass-approvals/:approvalId/decision")
  @RequireServiceAdminAction("break-glass.decide")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Break-glass approval decision envelope" })
  decideBreakGlassApprovalAlias(@Param("approvalId") approvalId: string, @Body() payload: BreakGlassDecisionBody, @Req() request: ServiceAdminRequest) {
    return this.serviceAdminService.decideBreakGlassApproval({ ...payload, actor: request.serviceAdminContext?.actor, approvalId });
  }

  @Get("audit-events")
  @RequireServiceAdminAction("service-admin.audit.read")
  @ApiOkResponse({ description: "Service-admin audit event search envelope" })
  fetchAuditEvents(
    @Query()
    filters: {
      action?: string;
      actorId?: string;
      cursor?: string;
      limit?: number | string;
      period?: string;
      query?: string;
      severity?: string;
      status?: string;
      target?: string;
      tenantId?: string;
      userId?: string;
    }
  ) {
    return this.serviceAdminService.fetchAuditEvents(filters);
  }
}
