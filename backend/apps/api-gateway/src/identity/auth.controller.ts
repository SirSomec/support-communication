import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { loadBackendConfig } from "@support-communication/config";
import { AuthService } from "./auth.service.js";
import { DemoServiceAdminGuard } from "./demo-service-admin.guard.js";
import { RequireServiceAdminAction, type ServiceAdminRequest } from "./service-admin-auth.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  private readonly demoServiceAdminKey = loadBackendConfig().DEMO_SERVICE_ADMIN_KEY;

  constructor(private readonly authService: AuthService) {}

  @Get("state")
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("auth.state")
  @ApiOkResponse({ description: "Current authentication state envelope" })
  getAuthState(@Req() request: ServiceAdminRequest) {
    return this.authService.getAuthState({ sessionId: request.serviceAdminContext?.sessionId });
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Password and MFA login envelope" })
  login(
    @Body() payload: { email?: string; mfaChallengeId?: string; otp?: string; password?: string },
    @Headers("x-demo-service-admin-key") demoServiceAdminKey?: string | string[]
  ) {
    const providedKey = Array.isArray(demoServiceAdminKey) ? demoServiceAdminKey[0] : demoServiceAdminKey;
    const privileged = providedKey === this.demoServiceAdminKey;

    if (payload.otp && !privileged) {
      throw new UnauthorizedException("Demo service-admin key is required to complete MFA login.");
    }

    return this.authService.login(payload, { privileged });
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
  @UseGuards(DemoServiceAdminGuard)
  @RequireServiceAdminAction("auth.logout")
  @ApiOkResponse({ description: "Logout envelope with auth audit metadata" })
  logout(@Body() payload: { reason?: string } = {}, @Req() request: ServiceAdminRequest) {
    return this.authService.logout({ ...payload, sessionId: request.serviceAdminContext?.sessionId });
  }
}
