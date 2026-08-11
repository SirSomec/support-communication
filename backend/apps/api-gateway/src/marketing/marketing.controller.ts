import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { TenantOperatorAuthGuard } from "../identity/tenant-operator-auth.guard.js";
import type { TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { MarketingAccessError, MarketingService } from "./marketing.service.js";

@ApiTags("marketing", "Marketing campaigns", "Audiences", "Preferences", "Marketing analytics")
@UseGuards(TenantOperatorAuthGuard)
@Controller("marketing")
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get("access")
  @ApiOperation({ operationId: "getMarketingAccessStatus", summary: "Get current user's marketing module availability" })
  accessStatus(@Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.accessStatus(context(request))); }

  @Get("workspace")
  @ApiOperation({ operationId: "fetchMarketingWorkspace", summary: "Get marketing campaigns, static audiences, templates and settings" })
  @ApiOkResponse({ description: "Tenant-scoped marketing workspace envelope" })
  workspace(@Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.fetchWorkspace(context(request))); }

  @Get("channel-capabilities")
  @ApiOperation({ operationId: "getMarketingChannelCapabilities", summary: "Get the active tenant channels and their supported marketing content blocks" })
  channelCapabilities(@Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.getChannelCapabilities(context(request))); }

  @Post("module/activate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "activateMarketingModule", summary: "Tenant owner activates the paid marketing module" })
  activate(@Body() body: { planKey?: string }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.activateModule(String(body?.planKey ?? ""), context(request))); }

  @Post("api-key")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createMarketingApiKey", summary: "Create a permanent full-access marketing API key; owner only" })
  createApiKey(@Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.createApiKey(context(request))); }

  @Patch("api-key/:apiKeyId/revoke")
  @ApiParam({ name: "apiKeyId" })
  @ApiOperation({ operationId: "revokeMarketingApiKey", summary: "Immediately revoke a permanent marketing API key; owner only" })
  revokeApiKey(@Param("apiKeyId") apiKeyId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.revokeApiKey(apiKeyId, context(request))); }

  @Patch("settings")
  @ApiOperation({ operationId: "updateMarketingSettings", summary: "Update quiet hours and consent text; owner only" })
  settings(@Body() body: Record<string, unknown>, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.updateSettings(body ?? {}, context(request))); }

  @Patch("access/:userId")
  @ApiParam({ name: "userId" })
  @ApiOperation({ operationId: "updateMarketingAccess", summary: "Tenant owner grants or revokes full marketing module access" })
  access(@Param("userId") userId: string, @Body() body: { enabled?: boolean }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.updateAccess(userId, Boolean(body?.enabled), context(request))); }

  @Post("audiences")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createMarketingAudience", summary: "Create a static audience from existing client profiles" })
  @ApiBody({ schema: { example: { name: "Постоянные клиенты", clientIds: ["client_1"] } } })
  audience(@Body() body: { clientIds?: string[]; name?: string }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.createAudience(body ?? {}, context(request))); }

  @Post("audiences/import-preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "previewMarketingAudienceImport", summary: "Match external audience rows before a user confirms ambiguous rows" })
  previewAudienceImport(@Body() body: { records?: Record<string, unknown>[] }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.previewAudienceImport(body ?? {}, context(request))); }

  @Patch("audiences/:audienceId/archive")
  @ApiParam({ name: "audienceId" })
  @ApiOperation({ operationId: "archiveMarketingAudience", summary: "Archive an unused static audience without removing client profiles" })
  archiveAudience(@Param("audienceId") audienceId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.archiveAudience(audienceId, context(request))); }

  @Post("audiences/:audienceId/syncs")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "audienceId" })
  @ApiOperation({ operationId: "createMarketingAudienceCrmSync", summary: "Create or rotate the inbound CRM audience synchronization secret; owner only" })
  audienceSync(@Param("audienceId") audienceId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.createAudienceSync(audienceId, context(request))); }

  @Post("consents")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "recordMarketingConsent", summary: "Record staff-confirmed per-channel consent or unsubscribe" })
  consent(@Body() body: Record<string, unknown>, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.recordConsent(body ?? {}, context(request))); }

  @Post("templates")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createMarketingTemplate", summary: "Create a marketing-only block template" })
  template(@Body() body: { content?: Record<string, unknown>; title?: string }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.createTemplate(body ?? {}, context(request))); }

  @Patch("templates/:templateId")
  @ApiParam({ name: "templateId" })
  @ApiOperation({ operationId: "updateMarketingTemplate", summary: "Update a versioned marketing template" })
  patchTemplate(@Param("templateId") templateId: string, @Body() body: { content?: Record<string, unknown>; title?: string }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.updateTemplate(templateId, body ?? {}, context(request))); }

  @Post("campaigns")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createMarketingCampaign", summary: "Create a personal or mass marketing campaign draft" })
  campaign(@Body() body: Record<string, unknown>, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.createCampaign(body ?? {}, context(request))); }

  @Patch("campaigns/:campaignId")
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "updateMarketingCampaign", summary: "Update a draft or scheduled campaign" })
  patchCampaign(@Param("campaignId") campaignId: string, @Body() body: Record<string, unknown>, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.updateCampaign(campaignId, body ?? {}, context(request))); }

  @Post("campaigns/:campaignId/clone")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "cloneMarketingCampaign", summary: "Create an editable draft copy of a campaign" })
  cloneCampaign(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.cloneCampaign(campaignId, context(request))); }

  @Get("analytics/campaigns")
  @ApiOperation({ operationId: "getMarketingCampaignAnalytics", summary: "Get per-campaign delivery analytics; read state is explicit when a channel does not report it" })
  analytics(@Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.getCampaignAnalytics(context(request))); }

  @Get("campaigns/:campaignId/results")
  @ApiParam({ name: "campaignId" })
  @ApiQuery({ name: "page", required: false, example: 1, description: "One-based result page; up to 100000." })
  @ApiQuery({ name: "pageSize", required: false, example: 100, description: "Recipients per page; from 1 to 1000." })
  @ApiOperation({ operationId: "getMarketingCampaignResults", summary: "Get delivery summary and the latest recipient-level marketing results" })
  results(@Param("campaignId") campaignId: string, @Query("page") page: string | undefined, @Query("pageSize") pageSize: string | undefined, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.getCampaignResults(campaignId, page, pageSize, context(request))); }

  @Post("campaigns/:campaignId/results/export")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiBody({ schema: { example: { format: "xlsx", kind: "detailed" } } })
  @ApiOperation({ operationId: "exportMarketingCampaignResults", summary: "Prepare audited CSV or XLSX campaign summary or recipient-level export data" })
  exportResults(@Param("campaignId") campaignId: string, @Body() body: { format?: "csv" | "xlsx"; kind?: "summary" | "detailed" }, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.exportCampaignResults(campaignId, body?.kind, body?.format, context(request))); }

  @Post("campaigns/:campaignId/preflight")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "preflightMarketingCampaign", summary: "Preview audience eligibility and projected overage before launch" })
  preflight(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.preflightCampaign(campaignId, context(request))); }

  @Get("clients/:clientId/preferences")
  @ApiParam({ name: "clientId" })
  @ApiOperation({ operationId: "getMarketingClientPreferences", summary: "Get per-channel marketing consent and unsubscribe history" })
  preferences(@Param("clientId") clientId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.getClientPreferences(clientId, context(request))); }

  @Get("test-recipients/search")
  @ApiQuery({ name: "q", required: true, example: "Самойлов", description: "Surname, phone number, or email fragment; at least two characters." })
  @ApiOperation({ operationId: "searchMarketingTestRecipients", summary: "Find existing client profiles for a test campaign delivery" })
  searchTestRecipients(@Query("q") query: string | undefined, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.searchTestRecipients(query, context(request))); }

  @Post("campaigns/:campaignId/launch")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe campaign launch key" })
  @ApiOperation({ operationId: "launchMarketingCampaign", summary: "Create the recipient snapshot and queue campaign deliveries" })
  launch(@Param("campaignId") campaignId: string, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.launchCampaign(campaignId, idempotencyKey, context(request))); }

  @Post("campaigns/:campaignId/test")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe test delivery key" })
  @ApiOperation({ operationId: "sendMarketingCampaignTest", summary: "Queue free, consent-protected test deliveries for existing client profiles" })
  test(@Param("campaignId") campaignId: string, @Body() body: { clientIds?: string[] }, @Headers("idempotency-key") idempotencyKey: string | undefined, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.sendTestCampaign(campaignId, body ?? {}, idempotencyKey, context(request))); }

  @Post("campaigns/:campaignId/retry-failed")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "retryFailedMarketingCampaignDeliveries", summary: "Requeue only terminally failed recipients without billing them again" })
  retryFailed(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.retryFailedCampaignDeliveries(campaignId, context(request))); }

  @Post("campaigns/:campaignId/pause")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "pauseMarketingCampaign", summary: "Stop unsent deliveries in a sending marketing campaign" })
  pause(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.transitionCampaign(campaignId, "pause", context(request))); }

  @Post("campaigns/:campaignId/resume")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "resumeMarketingCampaign", summary: "Resume delivery of a paused marketing campaign" })
  resume(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.resumeCampaign(campaignId, context(request))); }

  @Post("campaigns/:campaignId/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "campaignId" })
  @ApiOperation({ operationId: "cancelMarketingCampaign", summary: "Cancel a draft, scheduled, sending, or paused marketing campaign" })
  cancel(@Param("campaignId") campaignId: string, @Req() request: TenantOperatorRequest) { return this.run(() => this.marketingService.transitionCampaign(campaignId, "cancel", context(request))); }

  private async run(operation: () => Promise<unknown>) {
    try { return await operation(); }
    catch (error) {
      if (error instanceof MarketingAccessError) {
        return { service: "marketingService", operation: "access", status: "forbidden", data: {}, error: { code: error.message, message: "Marketing module access is required." } };
      }
      throw error;
    }
  }
}

function context(request: TenantOperatorRequest) {
  const value = request.tenantOperatorContext;
  if (!value) throw new MarketingAccessError("tenant_session_required");
  return { tenantId: value.tenantId, userId: value.userId };
}
