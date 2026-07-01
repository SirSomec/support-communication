import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { AutomationService } from "./automation.service.js";

@ApiTags("automation")
@Controller("automation")
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get("workspace")
  @ApiOkResponse({ description: "Automation, bot and proactive workspace envelope" })
  fetchAutomationWorkspace() {
    return this.automationService.fetchAutomationWorkspace();
  }

  @Post("bot-flow/validate")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot flow import validation envelope" })
  validateBotFlowImport(@Body() payload: unknown) {
    return this.automationService.validateBotFlowImport(payload as never);
  }

  @Post("bot-flows/validate")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot flow import validation envelope" })
  validateBotFlowImportAlias(@Body() payload: unknown) {
    return this.automationService.validateBotFlowImport(payload as never);
  }

  @Post("bots/:scenarioId/publish")
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
    }
  ) {
    const body = payload ?? {};
    return this.automationService.publishBotScenario({ ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey });
  }

  @Post("bot-scenarios/:scenarioId/publish")
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
    }
  ) {
    const body = payload ?? {};
    return this.automationService.publishBotScenario({ ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey });
  }

  @Post("bot-scenarios/:scenarioId/test-runs")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot scenario test run envelope" })
  testBotScenario(
    @Param("scenarioId") scenarioId: string,
    @Body()
    payload: {
      name?: string;
      testCases?: Array<Record<string, unknown>>;
    }
  ) {
    return this.automationService.testBotScenario({ ...(payload ?? {}), id: scenarioId });
  }

  @Post("proactive-rules")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Persist proactive delivery rule envelope" })
  saveProactiveRule(@Body() payload: { activeVariant?: string; channels?: string[]; cooldown?: string; id?: string; segment?: string; status?: string } | null) {
    const body = payload ?? {};
    return this.automationService.saveProactiveRule({
      channels: body.channels ?? [],
      id: body.id ?? "",
      activeVariant: body.activeVariant,
      cooldown: body.cooldown,
      segment: body.segment,
      status: body.status
    });
  }

  @Post("handoff-events")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot handoff summary realtime event envelope" })
  createBotHandoffSummary(
    @Body() payload: { botId?: string; collectedFields?: Record<string, unknown>; conversationId?: string; queue?: string; reason?: string }
  ) {
    return this.automationService.createBotHandoffSummary(payload);
  }

  @Post("bot-handoffs")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ description: "Bot handoff summary realtime event envelope" })
  createBotHandoffSummaryAlias(
    @Body() payload: { botId?: string; collectedFields?: Record<string, unknown>; conversationId?: string; queue?: string; reason?: string }
  ) {
    return this.automationService.createBotHandoffSummary(payload);
  }
}
