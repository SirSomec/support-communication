var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiExtraModels, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { TenantOperatorOrServiceAdminGuard } from "../conversation/tenant-operator-or-service-admin.guard.js";
import { RequireServiceAdminAction } from "../identity/service-admin-auth.js";
import { RequireTenantOperatorPermission } from "../identity/tenant-operator-auth.js";
import { AutomationService } from "./automation.service.js";
import { AutomationEnvelopeDto, BotSandboxMessageDto, BotSandboxSessionCreateDto, BotScenarioActionDto, BotScenarioDto, BotScenarioMutationDto, BotScenarioPublishDto, BotScenarioTestRunDto } from "./automation.openapi.dto.js";
let AutomationController = class AutomationController {
    automationService;
    constructor(automationService) {
        this.automationService = automationService;
    }
    fetchAutomationWorkspace(request) {
        return this.automationService.fetchAutomationWorkspace(automationContextFromRequest(request));
    }
    listBotScenarios(request) {
        return this.automationService.listBotScenarios(automationContextFromRequest(request));
    }
    fetchBotScenario(scenarioId, request) {
        return this.automationService.fetchBotScenario(scenarioId, automationContextFromRequest(request));
    }
    fetchVisitorWorkspace(request, from, to) {
        return this.automationService.fetchVisitorWorkspace(automationContextFromRequest(request), { from, to });
    }
    validateBotFlowImport(payload, request) {
        return this.automationService.validateBotFlowImport(payload, automationContextFromRequest(request));
    }
    validateBotFlowImportAlias(payload, request) {
        return this.automationService.validateBotFlowImport(payload, automationContextFromRequest(request));
    }
    createBotScenario(payload, request) {
        return this.automationService.createBotScenario(payload, automationContextFromRequest(request));
    }
    updateBotScenario(scenarioId, payload, request) {
        return this.automationService.updateBotScenario(scenarioId, payload, automationContextFromRequest(request));
    }
    disableBotScenario(scenarioId, idempotencyKey, body, request) {
        return this.automationService.disableBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
    }
    archiveBotScenario(scenarioId, idempotencyKey, body, request) {
        return this.automationService.archiveBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
    }
    restoreBotScenario(scenarioId, idempotencyKey, body, request) {
        return this.automationService.restoreBotScenario(scenarioId, automationContextFromRequest(request, { idempotencyKey, reason: body?.reason }));
    }
    publishBotScenario(scenarioId, idempotencyKey, payload, request) {
        const body = payload ?? {};
        return this.automationService.publishBotScenario({ ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey }, automationContextFromRequest(request, { idempotencyKey: idempotencyKey ?? body.idempotencyKey }));
    }
    publishBotScenarioAlias(scenarioId, idempotencyKey, payload, request) {
        const body = payload ?? {};
        return this.automationService.publishBotScenario({ ...body, id: scenarioId, idempotencyKey: idempotencyKey ?? body.idempotencyKey }, automationContextFromRequest(request, { idempotencyKey: idempotencyKey ?? body.idempotencyKey }));
    }
    testBotScenario(scenarioId, payload, request) {
        return this.automationService.testBotScenario({ ...(payload ?? {}), id: scenarioId }, automationContextFromRequest(request));
    }
    rollbackBotScenario(scenarioId, payload, request) {
        return this.automationService.rollbackBotScenarioToVersion(scenarioId, String(payload?.versionId ?? ""), automationContextFromRequest(request));
    }
    discardBotScenarioDraft(scenarioId, request) {
        return this.automationService.discardBotScenarioDraft(scenarioId, automationContextFromRequest(request));
    }
    createBotSandboxSession(scenarioId, payload, request) {
        return this.automationService.createBotSandboxSession(scenarioId, payload ?? {}, automationContextFromRequest(request));
    }
    fetchBotSandboxSession(scenarioId, sessionId, request) {
        return this.automationService.fetchBotSandboxSession(scenarioId, sessionId, automationContextFromRequest(request));
    }
    postBotSandboxMessage(scenarioId, sessionId, payload, request) {
        return this.automationService.postBotSandboxMessage(scenarioId, sessionId, payload ?? {}, automationContextFromRequest(request));
    }
    deleteBotSandboxSession(scenarioId, sessionId, request) {
        return this.automationService.deleteBotSandboxSession(scenarioId, sessionId, automationContextFromRequest(request));
    }
    saveBotSandboxRegression(scenarioId, sessionId, payload, request) {
        return this.automationService.saveBotSandboxRegression(scenarioId, sessionId, payload ?? {}, automationContextFromRequest(request));
    }
    saveProactiveRule(payload, request) {
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
    createBotHandoffSummary(payload, request) {
        return this.automationService.createBotHandoffSummary({ ...payload, ...automationContextFromRequest(request) });
    }
    createBotHandoffSummaryAlias(payload, request) {
        return this.automationService.createBotHandoffSummary({ ...payload, ...automationContextFromRequest(request) });
    }
    listBotAiFeedback(request) {
        return this.automationService.listBotAiFeedback(automationContextFromRequest(request));
    }
    resolveBotAiFeedback(feedbackId, body, request) {
        return this.automationService.resolveBotAiFeedback(feedbackId, String(body?.action ?? "reviewed"), automationContextFromRequest(request));
    }
    recordBotAiFeedback(payload, idempotencyKey, request) {
        return this.automationService.recordBotAiFeedback(payload, automationContextFromRequest(request, { idempotencyKey: idempotencyKey?.trim() || undefined }));
    }
};
__decorate([
    Get("workspace"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    ApiOkResponse({ description: "Automation, bot and proactive workspace envelope" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "fetchAutomationWorkspace", null);
__decorate([
    Get("bot-scenarios"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    ApiOperation({ operationId: "listBotScenarios", summary: "List bot scenarios for the active tenant" }),
    ApiOkResponse({ description: "Tenant-scoped bot scenario list envelope", type: AutomationEnvelopeDto }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "listBotScenarios", null);
__decorate([
    Get("bot-scenarios/:scenarioId"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    ApiOperation({ operationId: "fetchBotScenario", summary: "Get one tenant-scoped bot scenario and its versions" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiOkResponse({ description: "Tenant-scoped bot scenario detail envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "fetchBotScenario", null);
__decorate([
    Get("visitor-workspace"),
    RequireTenantOperatorPermission("visitors.read"),
    RequireServiceAdminAction("visitors.read"),
    ApiOkResponse({ description: "Visitor and proactive workspace envelope" }),
    __param(0, Req()),
    __param(1, Query("from")),
    __param(2, Query("to")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "fetchVisitorWorkspace", null);
__decorate([
    Post("bot-flow/validate"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Bot flow import validation envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "validateBotFlowImport", null);
__decorate([
    Post("bot-flows/validate"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Bot flow import validation envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "validateBotFlowImportAlias", null);
__decorate([
    Post("bot-scenarios"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "createBotScenario", summary: "Create a bot scenario draft" }),
    ApiBody({ type: BotScenarioMutationDto }),
    ApiOkResponse({ description: "Create bot scenario draft envelope", type: AutomationEnvelopeDto }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "createBotScenario", null);
__decorate([
    Patch("bot-scenarios/:scenarioId"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "updateBotScenario", summary: "Update a draft or disabled bot scenario" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiBody({ type: BotScenarioMutationDto }),
    ApiOkResponse({ description: "Update bot scenario draft envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "updateBotScenario", null);
__decorate([
    Post("bot-scenarios/:scenarioId/disable"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "disableBotScenario", summary: "Disable a published scenario without deleting it" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" }),
    ApiBody({ type: BotScenarioActionDto }),
    ApiOkResponse({ description: "Disable bot scenario envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "disableBotScenario", null);
__decorate([
    Delete("bot-scenarios/:scenarioId"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "archiveBotScenario", summary: "Archive a bot scenario (legacy DELETE route)" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" }),
    ApiBody({ type: BotScenarioActionDto }),
    ApiOkResponse({ description: "Archive bot scenario envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "archiveBotScenario", null);
__decorate([
    Post("bot-scenarios/:scenarioId/restore"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "restoreBotScenario", summary: "Restore an archived scenario as disabled" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key" }),
    ApiBody({ type: BotScenarioActionDto }),
    ApiOkResponse({ description: "Restore archived bot scenario as disabled envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "restoreBotScenario", null);
__decorate([
    Post("bots/:scenarioId/publish"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "publishBotScenarioLegacy", summary: "Publish bot scenario (legacy route)" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key; overrides body key." }),
    ApiBody({ type: BotScenarioPublishDto }),
    ApiOkResponse({ description: "Bot runtime publish envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "publishBotScenario", null);
__decorate([
    Post("bot-scenarios/:scenarioId/publish"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "publishBotScenario", summary: "Publish a tenant bot scenario" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiHeader({ name: "Idempotency-Key", required: false, description: "Repeat-safe client action key; overrides body key." }),
    ApiBody({ type: BotScenarioPublishDto }),
    ApiOkResponse({ description: "Bot runtime publish envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Headers("idempotency-key")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "publishBotScenarioAlias", null);
__decorate([
    Post("bot-scenarios/:scenarioId/test-runs"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "testBotScenario", summary: "Run a safe scenario sandbox test" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiBody({ type: BotScenarioTestRunDto }),
    ApiOkResponse({ description: "Bot scenario test run envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "testBotScenario", null);
__decorate([
    Post("bot-scenarios/:scenarioId/rollback"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "rollbackBotScenario", summary: "Roll a published scenario back to an earlier published version" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiOkResponse({ description: "Scenario rollback envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "rollbackBotScenario", null);
__decorate([
    Post("bot-scenarios/:scenarioId/discard-draft"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "discardBotScenarioDraft", summary: "Discard unpublished draft changes of a published scenario" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiOkResponse({ description: "Draft discard envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "discardBotScenarioDraft", null);
__decorate([
    Post("bot-scenarios/:scenarioId/sandbox-sessions"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "createBotSandboxSession", summary: "Start a live sandbox chat with a scenario" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiBody({ type: BotSandboxSessionCreateDto }),
    ApiOkResponse({ description: "Sandbox chat session envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "createBotSandboxSession", null);
__decorate([
    Get("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    ApiOperation({ operationId: "fetchBotSandboxSession", summary: "Get a sandbox chat session with its transcript" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiParam({ name: "sessionId", description: "Sandbox session identifier" }),
    ApiOkResponse({ description: "Sandbox chat session envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Param("sessionId")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "fetchBotSandboxSession", null);
__decorate([
    Post("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId/messages"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "postBotSandboxMessage", summary: "Send a client message to the sandbox chat (live AI run)" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiParam({ name: "sessionId", description: "Sandbox session identifier" }),
    ApiBody({ type: BotSandboxMessageDto }),
    ApiOkResponse({ description: "Sandbox turn envelope with bot replies and trace", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Param("sessionId")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "postBotSandboxMessage", null);
__decorate([
    Delete("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "deleteBotSandboxSession", summary: "Reset (delete) a sandbox chat session" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiParam({ name: "sessionId", description: "Sandbox session identifier" }),
    ApiOkResponse({ description: "Sandbox session deletion envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Param("sessionId")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "deleteBotSandboxSession", null);
__decorate([
    Post("bot-scenarios/:scenarioId/sandbox-sessions/:sessionId/regression-cases"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiOperation({ operationId: "saveBotSandboxRegression", summary: "Save the sandbox dialog as a regression test set" }),
    ApiParam({ name: "scenarioId", description: "Bot scenario identifier" }),
    ApiParam({ name: "sessionId", description: "Sandbox session identifier" }),
    ApiOkResponse({ description: "Saved regression test run envelope", type: AutomationEnvelopeDto }),
    __param(0, Param("scenarioId")),
    __param(1, Param("sessionId")),
    __param(2, Body()),
    __param(3, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "saveBotSandboxRegression", null);
__decorate([
    Post("proactive-rules"),
    RequireTenantOperatorPermission("automation.proactive.write"),
    RequireServiceAdminAction("automation.proactive.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Persist proactive delivery rule envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "saveProactiveRule", null);
__decorate([
    Post("handoff-events"),
    RequireTenantOperatorPermission("automation.proactive.write"),
    RequireServiceAdminAction("automation.proactive.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Bot handoff summary realtime event envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "createBotHandoffSummary", null);
__decorate([
    Post("bot-handoffs"),
    RequireTenantOperatorPermission("automation.proactive.write"),
    RequireServiceAdminAction("automation.proactive.write"),
    HttpCode(HttpStatus.OK),
    ApiOkResponse({ description: "Bot handoff summary realtime event envelope" }),
    __param(0, Body()),
    __param(1, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "createBotHandoffSummaryAlias", null);
__decorate([
    Get("bot-feedback"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    ApiOkResponse({ description: "Tenant bot AI feedback review queue" }),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "listBotAiFeedback", null);
__decorate([
    Post("bot-feedback/:feedbackId/resolve"),
    RequireTenantOperatorPermission("automation.write"),
    RequireServiceAdminAction("automation.write"),
    HttpCode(HttpStatus.OK),
    ApiParam({ name: "feedbackId", description: "Feedback item identifier" }),
    ApiOkResponse({ description: "Mark a feedback item as reviewed" }),
    __param(0, Param("feedbackId")),
    __param(1, Body()),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "resolveBotAiFeedback", null);
__decorate([
    Post("bot-feedback"),
    RequireTenantOperatorPermission("automation.read"),
    RequireServiceAdminAction("automation.read"),
    HttpCode(HttpStatus.OK),
    ApiHeader({ name: "idempotency-key", required: false }),
    ApiOkResponse({ description: "Record operator/admin bot AI feedback without mutating knowledge" }),
    __param(0, Body()),
    __param(1, Headers("idempotency-key")),
    __param(2, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationController.prototype, "recordBotAiFeedback", null);
AutomationController = __decorate([
    ApiTags("automation"),
    ApiExtraModels(AutomationEnvelopeDto, BotScenarioDto, BotScenarioMutationDto, BotScenarioPublishDto, BotScenarioActionDto, BotScenarioTestRunDto, BotSandboxSessionCreateDto, BotSandboxMessageDto),
    UseGuards(TenantOperatorOrServiceAdminGuard),
    Controller("automation"),
    __metadata("design:paramtypes", [AutomationService])
], AutomationController);
export { AutomationController };
function automationContextFromRequest(request, extra = {}) {
    const serviceAdminContext = request.serviceAdminContext;
    const tenantId = request.tenantOperatorContext?.tenantId ?? serviceAdminContext?.currentTenantId;
    const actor = request.tenantOperatorContext?.userId ?? request.serviceAdminContext?.actor?.id;
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
//# sourceMappingURL=automation.controller.js.map