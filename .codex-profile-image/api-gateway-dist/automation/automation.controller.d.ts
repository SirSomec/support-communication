import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { AutomationService } from "./automation.service.js";
export declare class AutomationController {
    private readonly automationService;
    constructor(automationService: AutomationService);
    fetchAutomationWorkspace(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    listBotScenarios(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchBotScenario(scenarioId: string, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchVisitorWorkspace(request: TenantOperatorRequest, from?: string, to?: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    validateBotFlowImport(payload: unknown, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    validateBotFlowImportAlias(payload: unknown, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createBotScenario(payload: Record<string, unknown>, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateBotScenario(scenarioId: string, payload: Record<string, unknown>, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    disableBotScenario(scenarioId: string, idempotencyKey: string | undefined, body: {
        reason?: string;
    } | undefined, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    archiveBotScenario(scenarioId: string, idempotencyKey: string | undefined, body: {
        reason?: string;
    } | undefined, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    restoreBotScenario(scenarioId: string, idempotencyKey: string | undefined, body: {
        reason?: string;
    } | undefined, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    publishBotScenario(scenarioId: string, idempotencyKey: string | undefined, payload: {
        channels?: string[];
        flowEdges?: Array<{
            from?: string;
            label?: string;
            to?: string;
        }>;
        flowNodes?: Array<{
            id: string;
            title?: string;
            type: string;
        }>;
        idempotencyKey?: string;
        name?: string;
        schemaVersion?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    publishBotScenarioAlias(scenarioId: string, idempotencyKey: string | undefined, payload: {
        channels?: string[];
        flowEdges?: Array<{
            from?: string;
            label?: string;
            to?: string;
        }>;
        flowNodes?: Array<{
            id: string;
            title?: string;
            type: string;
        }>;
        idempotencyKey?: string;
        name?: string;
        schemaVersion?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    testBotScenario(scenarioId: string, payload: {
        name?: string;
        testMessage?: string;
        testCases?: Array<Record<string, unknown>>;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    rollbackBotScenario(scenarioId: string, payload: {
        versionId?: string;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    discardBotScenarioDraft(scenarioId: string, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createBotSandboxSession(scenarioId: string, payload: {
        channel?: string;
        locale?: string;
        mode?: string;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchBotSandboxSession(scenarioId: string, sessionId: string, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    postBotSandboxMessage(scenarioId: string, sessionId: string, payload: {
        messageId?: string;
        quickReply?: string;
        text?: string;
        value?: unknown;
        webhooksEnabled?: boolean;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteBotSandboxSession(scenarioId: string, sessionId: string, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveBotSandboxRegression(scenarioId: string, sessionId: string, payload: {
        name?: string;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveProactiveRule(payload: {
        activeVariant?: string;
        channels?: string[];
        cooldown?: string;
        id?: string;
        segment?: string;
        status?: string;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createBotHandoffSummary(payload: {
        botId?: string;
        collectedFields?: Record<string, unknown>;
        conversationId?: string;
        queue?: string;
        reason?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createBotHandoffSummaryAlias(payload: {
        botId?: string;
        collectedFields?: Record<string, unknown>;
        conversationId?: string;
        queue?: string;
        reason?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    listBotAiFeedback(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    resolveBotAiFeedback(feedbackId: string, body: {
        action?: string;
    } | null, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordBotAiFeedback(payload: {
        citationSourceIds?: string[];
        comment?: string;
        conversationId?: string;
        outcome?: "helped" | "not_helped" | "wrong_source";
        scenarioId?: string;
    }, idempotencyKey: string | undefined, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
