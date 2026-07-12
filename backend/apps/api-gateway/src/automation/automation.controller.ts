import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission, type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { AutomationService, type AutomationRequestContext } from "./automation.service.js";

@ApiTags("automation")
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
  validateBotFlowImport(@Body() payload: unknown) {
    return this.automationService.validateBotFlowImport(payload as never);
  }

  @Post("bot-flows/validate")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot flow import validation envelope" })
  validateBotFlowImportAlias(@Body() payload: unknown) {
    return this.automationService.validateBotFlowImport(payload as never);
  }

  @Post("bot-scenarios")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Create bot scenario draft envelope" })
  createBotScenario(@Body() payload: Record<string, unknown>, @Req() request: TenantOperatorRequest) {
    return this.automationService.createBotScenario(payload as never, automationContextFromRequest(request));
  }

  @Patch("bot-scenarios/:scenarioId")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Update bot scenario draft envelope" })
  updateBotScenario(@Param("scenarioId") scenarioId: string, @Body() payload: Record<string, unknown>, @Req() request: TenantOperatorRequest) {
    return this.automationService.updateBotScenario(scenarioId, payload as never, automationContextFromRequest(request));
  }

  @Post("bots/:scenarioId/publish")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot runtime publish envelope" })
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
      automationContextFromRequest(request)
    );
  }

  @Post("bot-scenarios/:scenarioId/publish")
  @RequireTenantOperatorPermission("automation.write")
  @RequireServiceAdminAction("automation.write")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot runtime publish envelope" })
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
      automationContextFromRequest(request)
    );
  }

  @Post("bot-scenarios/:scenarioId/test-runs")
  @RequireTenantOperatorPermission("automation.read")
  @RequireServiceAdminAction("automation.read")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot scenario test run envelope" })
  testBotScenario(
    @Param("scenarioId") scenarioId: string,
    @Body()
    payload: {
      name?: string;
      testCases?: Array<Record<string, unknown>>;
    },
    @Req() request: TenantOperatorRequest
  ) {
    return this.automationService.testBotScenario({ ...(payload ?? {}), id: scenarioId }, automationContextFromRequest(request));
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
}

function automationContextFromRequest(request: TenantOperatorRequest): AutomationRequestContext {
  const serviceAdminContext = (request as TenantOperatorRequest & { serviceAdminContext?: { currentTenantId?: string } }).serviceAdminContext;
  const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
  return tenantId ? { tenantId } : {};
}
