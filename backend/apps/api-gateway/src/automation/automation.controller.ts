import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { AutomationService, type AutomationRequestContext } from "./automation.service.js";
import { AutomationEnvelopeDto, BotSandboxMessageDto, BotSandboxSessionCreateDto, BotScenarioActionDto, BotScenarioDto, BotScenarioMutationDto, BotScenarioPublishDto, BotScenarioTestRunDto } from "./automation.openapi.dto.js";

@ApiTags("automation")
@ApiExtraModels(AutomationEnvelopeDto, BotScenarioDto, BotScenarioMutationDto, BotScenarioPublishDto, BotScenarioActionDto, BotScenarioTestRunDto, BotSandboxSessionCreateDto, BotSandboxMessageDto)
@UseGuards(TenantOperatorOrServiceAdminGuard)
@Controller("automation")
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get("workspace")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @ApiOkResponse({ description: "Automation, bot and proactive workspace envelope" })
  fetchAutomationWorkspace(@Req() request: TenantOperatorRequest) {
    return this.automationService.fetchAutomationWorkspace(automationContextFromRequest(request));
  }

  @Get("bot-scenarios")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @ApiOperation({ operationId: "listBotScenarios", summary: "List bot scenarios for the active tenant" })
  @ApiOkResponse({ description: "Tenant-scoped bot scenario list envelope", type: AutomationEnvelopeDto })
  listBotScenarios(@Req() request: TenantOperatorRequest) {
    return this.automationService.listBotScenarios(automationContextFromRequest(request));
  }

  @Get("bot-scenarios/:scenarioId")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @ApiOperation({ operationId: "fetchBotScenario", summary: "Get one tenant-scoped bot scenario and its versions" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiOkResponse({ description: "Tenant-scoped bot scenario detail envelope", type: AutomationEnvelopeDto })
  fetchBotScenario(@Param("scenarioId") scenarioId: string, @Req() request: TenantOperatorRequest) {
    return this.automationService.fetchBotScenario(scenarioId, automationContextFromRequest(request));
  }

  @Get("visitor-workspace")
  @RequireTenantOperatorPermission("visitors.read")
  @RequireServiceAdminAction("visitors.read")
  @ApiOkResponse({ description: "Visitor and proactive workspace envelope" })
  fetchVisitorWorkspace(@Req() request: TenantOperatorRequest, @Query("from") from?: string, @Query("to") to?: string) {
    return this.automationService.fetchVisitorWorkspace(automationContextFromRequest(request), { from, to });
  }

  @Post("bot-flow/validate")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot flow import validation envelope" })
  validateBotFlowImport(@Body() payload: unknown, @Req() request: TenantOperatorRequest) {
    return this.automationService.validateBotFlowImport(payload as never, automationContextFromRequest(request));
  }

  @Post("bot-flows/validate")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot flow import validation envelope" })
  validateBotFlowImportAlias(@Body() payload: unknown, @Req() request: TenantOperatorRequest) {
    return this.automationService.validateBotFlowImport(payload as never, automationContextFromRequest(request));
  }

  @Post("bot-scenarios")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createBotScenario", summary: "Create a bot scenario draft" })
  @ApiBody({ type: BotScenarioMutationDto })
  @ApiOkResponse({ description: "Create bot scenario draft envelope", type: AutomationEnvelopeDto })
  createBotScenario(@Body() payload: Record<string, unknown>, @Req() request: TenantOperatorRequest) {
    return this.automationService.createBotScenario(payload as never, automationContextFromRequest(request));
  }

  @Patch("bot-scenarios/:scenarioId")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "updateBotScenario", summary: "Update a draft or disabled bot scenario" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiBody({ type: BotScenarioMutationDto })
  @ApiOkResponse({ description: "Update bot scenario draft envelope", type: AutomationEnvelopeDto })
  updateBotScenario(@Param("scenarioId") scenarioId: string, @Body() payload: Record<string, unknown>, @Req() request: TenantOperatorRequest) {
    return this.automationService.updateBotScenario(scenarioId, payload as never, automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/disable")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "disableBotScenario", summary: "Disable a published scenario without deleting it" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" })
  @ApiBody({ type: BotScenarioActionDto })
  @ApiOkResponse({ description: "Disable bot scenario envelope", type: AutomationEnvelopeDto })
  disableBotScenario(@Param("scenarioId") scenarioId: string, @Headers("idempotency-key") idempotencyKey: string | undefined, @Body() body: { reason?: string } | undefined, @Req() request: TenantOperatorRequest) {
    return this.automationService.disableBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
  }

  @Delete("bot-scenarios/:scenarioId")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "archiveBotScenario", summary: "Archive a bot scenario (legacy DELETE route)" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" })
  @ApiBody({ type: BotScenarioActionDto })
  @ApiOkResponse({ description: "Archive bot scenario envelope", type: AutomationEnvelopeDto })
  archiveBotScenario(@Param("scenarioId") scenarioId: string, @Headers("idempotency-key") idempotencyKey: string | undefined, @Body() body: { reason?: string } | undefined, @Req() request: TenantOperatorRequest) {
    return this.automationService.archiveBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
  }

  @Post("bot-scenarios/:scenarioId/restore")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "restoreBotScenario", summary: "Restore an archived scenario as disabled" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" })
  @ApiBody({ type: BotScenarioActionDto })
  @ApiOkResponse({ description: "Restore archived bot scenario as disabled envelope", type: AutomationEnvelopeDto })
  restoreBotScenario(@Param("scenarioId") scenarioId: string, @Headers("idempotency-key") idempotencyKey: string | undefined, @Body() body: { reason?: string } | undefined, @Req() request: TenantOperatorRequest) {
    return this.automationService.restoreBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
  }

  @Post("bots/:scenarioId/publish")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "publishBotScenarioLegacy", summary: "Publish bot scenario (legacy route)" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key; overrides body key." })
  @ApiBody({ type: BotScenarioPublishDto })
  @ApiOkResponse({ description: "Bot runtime publish envelope", type: AutomationEnvelopeDto })
  publishBotScenario(
    @Param("scenarioId") scenarioId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body()
    payload: {
      channels?: string[];
      flowEdges?: Array<{ from?: string; label?: string; to?: string }>;
      flowNodes?: Array<{ id: string; title?: string; type: string }>;
      idempotencyKey?: string;
      name?: string;
      schemaVersion?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    const body = payload ?? {};
    return this.automationService.publishBotScenario(
      { ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey },
      automationContextFromRequest(request, { idempotencyKey: idempotencyKey ?? body.idempotencyKey })
    );
  }

  @Post("bot-scenarios/:scenarioId/publish")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "publishBotScenario", summary: "Publish a tenant bot scenario" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key; overrides body key." })
  @ApiBody({ type: BotScenarioPublishDto })
  @ApiOkResponse({ description: "Bot runtime publish envelope", type: AutomationEnvelopeDto })
  publishBotScenarioAlias(
    @Param("scenarioId") scenarioId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body()
    payload: {
      channels?: string[];
      flowEdges?: Array<{ from?: string; label?: string; to?: string }>;
      flowNodes?: Array<{ id: string; title?: string; type: string }>;
      idempotencyKey?: string;
      name?: string;
      schemaVersion?: string;
    },
    @Req() request: TenantOperatorRequest
  ) {
    const body = payload ?? {};
    return this.automationService.publishBotScenario(
      { ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey },
      automationContextFromRequest(request, { idempotencyKey: idempotencyKey ?? body.idempotencyKey })
    );
  }

  @Post("bot-scenarios/:scenarioId/test-runs")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "testBotScenario", summary: "Run a safe scenario sandbox test" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiBody({ type: BotScenarioTestRunDto })
  @ApiOkResponse({ description: "Bot scenario test run envelope", type: AutomationEnvelopeDto })
  testBotScenario(
    @Param("scenarioId") scenarioId: string,
    @Body()
    payload: {
      name?: string;
      testMessage?: string;
      testCases?: Array<Record<string, unknown>>;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.testBotScenario({ ...(payload ?? {}), id: scenarioId }, automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/rollback")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "rollbackBotScenario", summary: "Roll a published scenario back to an earlier published version" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiOkResponse({ description: "Scenario rollback envelope", type: AutomationEnvelopeDto })
  rollbackBotScenario(
    @Param("scenarioId") scenarioId: string,
    @Body() payload: { versionId?: string } | null,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.rollbackBotScenarioToVersion(scenarioId, String(payload?.versionId ?? ""), automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/discard-draft")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "discardBotScenarioDraft", summary: "Discard unpublished draft changes of a published scenario" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiOkResponse({ description: "Draft discard envelope", type: AutomationEnvelopeDto })
  discardBotScenarioDraft(@Param("scenarioId") scenarioId: string, @Req() request: TenantOperatorRequest) {
    return this.automationService.discardBotScenarioDraft(scenarioId, automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/sandbox-sessions")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "createBotSandboxSession", summary: "Start a live sandbox chat with a scenario" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiBody({ type: BotSandboxSessionCreateDto })
  @ApiOkResponse({ description: "Sandbox chat session envelope", type: AutomationEnvelopeDto })
  createBotSandboxSession(
    @Param("scenarioId") scenarioId: string,
    @Body() payload: { channel?: string; locale?: string; mode?: string } | null,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.createBotSandboxSession(scenarioId, payload ?? {}, automationContextFromRequest(request));
  }

  @Get("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @ApiOperation({ operationId: "fetchBotSandboxSession", summary: "Get a sandbox chat session with its transcript" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiParam({ name: "sessionId", description: "Sandbox session identifier" })
  @ApiOkResponse({ description: "Sandbox chat session envelope", type: AutomationEnvelopeDto })
  fetchBotSandboxSession(
    @Param("scenarioId") scenarioId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.fetchBotSandboxSession(scenarioId, sessionId, automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId/messages")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "postBotSandboxMessage", summary: "Send a client message to the sandbox chat (live AI run)" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiParam({ name: "sessionId", description: "Sandbox session identifier" })
  @ApiBody({ type: BotSandboxMessageDto })
  @ApiOkResponse({ description: "Sandbox turn envelope with bot replies and trace", type: AutomationEnvelopeDto })
  postBotSandboxMessage(
    @Param("scenarioId") scenarioId: string,
    @Param("sessionId") sessionId: string,
    @Body() payload: { messageId?: string; quickReply?: string; text?: string; value?: unknown; webhooksEnabled?: boolean } | null,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.postBotSandboxMessage(scenarioId, sessionId, payload ?? {}, automationContextFromRequest(request));
  }

  @Delete("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "deleteBotSandboxSession", summary: "Reset (delete) a sandbox chat session" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiParam({ name: "sessionId", description: "Sandbox session identifier" })
  @ApiOkResponse({ description: "Sandbox session deletion envelope", type: AutomationEnvelopeDto })
  deleteBotSandboxSession(
    @Param("scenarioId") scenarioId: string,
    @Param("sessionId") sessionId: string,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.deleteBotSandboxSession(scenarioId, sessionId, automationContextFromRequest(request));
  }

  @Post("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId/regression-cases")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: "saveBotSandboxRegression", summary: "Save the sandbox dialog as a regression test set" })
  @ApiParam({ name: "scenarioId", description: "Bot scenario identifier" })
  @ApiParam({ name: "sessionId", description: "Sandbox session identifier" })
  @ApiOkResponse({ description: "Saved regression test run envelope", type: AutomationEnvelopeDto })
  saveBotSandboxRegression(
    @Param("scenarioId") scenarioId: string,
    @Param("sessionId") sessionId: string,
    @Body() payload: { name?: string } | null,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.saveBotSandboxRegression(scenarioId, sessionId, payload ?? {}, automationContextFromRequest(request));
  }

  @Post("proactive-rules")
  @RequireTenantOperatorPermission("automation.proactive.write")
  @RequireServiceAdminAction("automation.proactive.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Persist proactive delivery rule envelope" })
  saveProactiveRule(
    @Body() payload: { activeVariant?: string; channels?: string[]; cooldown?: string; id?: string; segment?: string; status?: string } | null,
    @Req() request: TenantOperatorRequest
  ) {
    const body = payload ?? {};
    return this.automationService.saveProactiveRule({
      channels: body.channels ?? [],
      id: body.id ?? "",
      activeVariant: body.activeVariant,
      cooldown: body.cooldown,
      segment: body.segment,
      status: body.status
    }, automationContextFromRequest(request));
  }

  @Post("handoff-events")
  @RequireTenantOperatorPermission("automation.proactive.write")
  @RequireServiceAdminAction("automation.proactive.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot handoff summary realtime event envelope" })
  createBotHandoffSummary(
    @Body() payload: { botId?: string; collectedFields?: Record<string, unknown>; conversationId?: string; queue?: string; reason?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.createBotHandoffSummary({ ...payload, ...automationContextFromRequest(request) });
  }

  @Post("bot-handoffs")
  @RequireTenantOperatorPermission("automation.proactive.write")
  @RequireServiceAdminAction("automation.proactive.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot handoff summary realtime event envelope" })
  createBotHandoffSummaryAlias(
    @Body() payload: { botId?: string; collectedFields?: Record<string, unknown>; conversationId?: string; queue?: string; reason?: string },
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.createBotHandoffSummary({ ...payload, ...automationContextFromRequest(request) });
  }

  @Get("bot-feedback")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @ApiOkResponse({ description: "Tenant bot AI feedback review queue" })
  listBotAiFeedback(@Req() request: TenantOperatorRequest) {
    return this.automationService.listBotAiFeedback(automationContextFromRequest(request));
  }

  @Post("bot-feedback/:feedbackId/resolve")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: "feedbackId", description: "Feedback item identifier" })
  @ApiOkResponse({ description: "Mark a feedback item as reviewed" })
  resolveBotAiFeedback(@Param("feedbackId") feedbackId: string, @Body() body: { action?: string } | null, @Req() request: TenantOperatorRequest) {
    return this.automationService.resolveBotAiFeedback(feedbackId, String(body?.action ?? "reviewed"), automationContextFromRequest(request));
  }

  @Post("bot-feedback")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: "idempotency-key", required: false })
  @ApiOkResponse({ description: "Record operator/admin bot AI feedback without mutating knowledge" })
  recordBotAiFeedback(
    @Body()
    payload: {
      citationSourceIds?: string[];
      comment?: string;
      conversationId?: string;
      outcome?: "helped" | "not_helped" | "wrong_source";
      scenarioId?: string;
    },
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.recordBotAiFeedback(
      payload,
      automationContextFromRequest(request, { idempotencyKey: idempotencyKey?.trim() || undefined })
    );
  }
}

function automationContextFromRequest(request: TenantOperatorRequest, extra: Partial<AutomationRequestContext> = {}): AutomationRequestContext {
  const serviceAdminContext = (request as TenantOperatorRequest & { serviceAdminContext?: { currentTenantId?: string } }).serviceAdminContext;
  const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
  const actor = request.tenantOperatorContext?.userId ?? (request as TenantOperatorRequest & { serviceAdminContext?: { actor?: { id?: string } } }).serviceAdminContext?.actor?.id;
  const permissions = request.tenantOperatorContext?.permissions ?? [];
  const isServiceAdmin = Boolean(serviceAdminContext);
  return tenantId
    ? {
      ...extra,
      ...(actor ? { actor } : {}),
      isServiceAdmin,
      permissions,
      tenantId
    }
    : {};
}
