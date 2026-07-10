import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { ServiceAdminSessionGuard } from "./service-admin-session.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";
import { TenantOperatorAuthGuard } from "./tenant-operator-auth.guard.js";
import { type TenantOperatorRequest } from "./tenant-operator-auth.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get("state")
  @UseGuards(ServiceAdminSessionGuard)
  @RequireServiceAdminAction("auth.state")
  @ApiOkResponse({ description: "Current authentication state envelope" })
  getAuthState(@Req() request: ServiceAdminRequest) {
    return this.authService.getAuthState({ sessionId: request.serviceAdminContext?.sessionId });
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Password and MFA login envelope" })
  login(@Body() payload: { email?: string; mfaChallengeId?: string; otp?: string; password?: string }) {
    return this.authService.login(payload);
  }

  @Post("tenant/login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Tenant operator login envelope" })
  tenantLogin(@Body() payload: { email?: string; mfaChallengeId?: string; otp?: string; password?: string; tenantId?: string }) {
    return this.authService.loginTenantOperator(payload);
  }

  @Get("tenant/state")
  @UseGuards(TenantOperatorAuthGuard)
  @ApiOkResponse({ description: "Tenant operator auth state envelope" })
  tenantState(@Req() request: TenantOperatorRequest) {
    return this.authService.getTenantOperatorState({ sessionId: request.tenantOperatorContext?.sessionId });
  }

  @Post("tenant/logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantOperatorAuthGuard)
  @ApiOkResponse({ description: "Tenant operator logout envelope" })
  tenantLogout(@Req() request: TenantOperatorRequest) {
    return this.authService.logoutTenantOperator({ sessionId: request.tenantOperatorContext?.sessionId });
  }

  @Post("tenant/select")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Tenant membership selection envelope" })
  selectTenant(@Body() payload: { email?: string; tenantId?: string }) {
    return this.authService.selectTenant(payload);
  }

  @Post("invites/accept")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Invite acceptance envelope" })
  acceptInvite(@Body() payload: { code?: string; email?: string; mfaChallengeId?: string; otp?: string; password?: string }) {
    return this.authService.acceptInvite(payload);
  }

  @Post("recovery/request")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Password recovery request envelope" })
  requestRecovery(@Body() payload: { email?: string }) {
    return this.authService.requestRecovery(payload);
  }

  @Post("recovery/complete")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Password recovery completion envelope" })
  completeRecovery(@Body() payload: { email?: string; mfaChallengeId?: string; otp?: string; password?: string; token?: string }) {
    return this.authService.completeRecovery(payload);
  }

  @Post("oidc/start")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "OIDC authorization redirect envelope" })
  startOidcLogin(@Body() payload: { providerId?: string; redirectUri?: string }) {
    return this.authService.startOidcLogin(payload);
  }

  @Get("oidc/callback")
  @ApiOkResponse({ description: "OIDC callback descriptor validation envelope" })
  completeOidcCallback(@Query() query: { code?: string; error?: string; error_description?: string; state?: string }) {
    return this.authService.completeOidcCallback({
      code: query.code,
      error: query.error,
      errorDescription: query.error_description,
      state: query.state
    });
  }

  @Post("saml/acs")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "SAML ACS assertion validation envelope" })
  completeSamlAcs(@Body() payload: {
    assertionExpiresAt?: string;
    assertionId?: string;
    audience?: string;
    providerId?: string;
    requestId?: string;
    subjectId?: string;
  }) {
    return this.authService.completeSamlAcs(payload);
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ServiceAdminSessionGuard)
  @RequireServiceAdminAction("auth.logout")
  @ApiOkResponse({ description: "Logout envelope with auth audit metadata" })
  logout(@Body() payload: { reason?: string } = {}, @Req() request: ServiceAdminRequest) {
    return this.authService.logout({ ...payload, sessionId: request.serviceAdminContext?.sessionId });
  }
}
