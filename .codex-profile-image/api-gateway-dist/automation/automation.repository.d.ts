import type { OutboxEvent } from "@support-communication/events";
import type { ConversationOutboundDescriptor, ConversationRepository } from "../conversation/conversation.repository.js";
import type { BotScenario, ProactiveRule } from "./automation.types.js";
export interface AutomationPublishIdempotencyRecord {
    fingerprint: string;
    key: string;
    result: Record<string, unknown>;
    tenantId: string;
}
export interface AutomationBotTestRun {
    auditId: string;
    cases: Array<Record<string, unknown>>;
    queue: string;
    scenarioId: string;
    status: string;
    tenantId: string;
    testRunId: string;
}
export interface AutomationBotScenarioVersion {
    basePrompt?: string;
    createdAt: string;
    flowEdges: BotScenario["flowEdges"];
    flowNodes: BotScenario["flowNodes"];
    priority?: number;
    scenarioId: string;
    sourceBindings?: BotScenario["sourceBindings"];
    status: string;
    tenantId: string;
    triggerRules?: BotScenario["triggerRules"];
    versionId: string;
}
export interface AutomationBotPublishAuditEvent {
    action: string;
    actor: string;
    auditId: string;
    createdAt: string;
    idempotencyKey: string;
    immutable: true;
    runtimeVersion: string;
    scenarioId: string;
    tenantId: string;
    versionId: string;
}
export interface AutomationBotRuntimeInstance {
    attempts: number;
    context: Record<string, unknown>;
    conversationId: string;
    createdAt: string;
    currentNodeId: string;
    id: string;
    lastError: string | null;
    nextAttemptAt: string | null;
    scenarioId: string;
    status: "active" | "completed" | "dead_lettered" | "handoff" | "retry_scheduled";
    tenantId: string;
    updatedAt: string;
    versionId: string;
}
export interface AutomationBotRuntimeStep {
    conversationId: string;
    createdAt: string;
    error: string | null;
    handoffSummary: Record<string, unknown> | null;
    id: string;
    inputEvent: Record<string, unknown>;
    inputEventId: string;
    lifecycleEvent: Record<string, unknown> | null;
    nodeId: string;
    nodeType: string;
    outcome: string;
    runtimeId: string;
    sideEffects: Array<Record<string, unknown>>;
    tenantId: string;
    webhookResponse: Record<string, unknown> | null;
}
export interface AutomationBotRuntimeSideEffect {
    attempts: number;
    conversationId: string;
    createdAt: string;
    deadLetteredAt: string | null;
    deliveredAt: string | null;
    id: string;
    kind: "bot_handoff" | "conversation_close" | "message_delivery";
    lastError: string | null;
    leaseUntil: string | null;
    nextAttemptAt: string | null;
    payload: Record<string, unknown>;
    status: "dead_lettered" | "delivered" | "pending" | "processing" | "retry_scheduled";
    stepId: string;
    tenantId: string;
    updatedAt: string;
}
export interface AutomationBotRuntimeCommitInput {
    expectedCurrentNodeId?: string;
    instance: AutomationBotRuntimeInstance;
    step: AutomationBotRuntimeStep;
}
export interface AutomationBotRuntimeCommitResult {
    instance: AutomationBotRuntimeInstance;
    outcome: "committed" | "duplicate";
    step: AutomationBotRuntimeStep;
}
export interface AutomationProactiveExecutionWindow {
    active: boolean;
    daysOfWeek: number[];
    endsAt: string;
    ruleId: string;
    startsAt: string;
    tenantId: string;
    timezone: string;
    windowId: string;
}
export interface AutomationProactiveExecutionWindowFilter {
    ruleId?: string;
    tenantId?: string;
}
export type AutomationProactiveExecutionWindowInput = Omit<AutomationProactiveExecutionWindow, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveFrequencyCap {
    active: boolean;
    capId: string;
    limit: number;
    period: "day" | "hour" | "week";
    resetAt: string;
    ruleId: string;
    tenantId: string;
    used: number;
}
export interface AutomationProactiveFrequencyCapFilter {
    ruleId?: string;
    tenantId?: string;
}
export type AutomationProactiveFrequencyCapInput = Omit<AutomationProactiveFrequencyCap, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveExperimentAssignment {
    assignedAt: string;
    assignmentId: string;
    experimentId: string;
    ruleId: string;
    subjectId: string;
    tenantId: string;
    variant: string;
}
export interface AutomationProactiveExperimentAssignmentFilter {
    ruleId?: string;
    subjectId?: string;
    tenantId?: string;
}
export type AutomationProactiveExperimentAssignmentInput = Omit<AutomationProactiveExperimentAssignment, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveDeliveryAttempt {
    attemptedAt: string;
    attemptId: string;
    channel: string;
    descriptorId: string;
    ruleId: string;
    status: string;
    subjectId: string;
    tenantId: string;
    traceId: string;
}
export interface AutomationProactiveDeliveryAttemptFilter {
    ruleId?: string;
    subjectId?: string;
    tenantId?: string;
}
export type AutomationProactiveDeliveryAttemptInput = Omit<AutomationProactiveDeliveryAttempt, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveDeliveryIdempotencyRecord {
    fingerprint: string;
    key: string;
    result: Record<string, unknown>;
    ruleId: string;
    subjectId: string;
    tenantId: string;
}
export type AutomationProactiveDeliveryIdempotencyRecordInput = Omit<AutomationProactiveDeliveryIdempotencyRecord, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveDeliveryAttribution {
    assignedAt: string;
    attributionId: string;
    descriptorId: string;
    experimentId: string;
    ruleId: string;
    subjectId: string;
    tenantId: string;
    variant: string;
}
export interface AutomationProactiveDeliveryAttributionFilter {
    ruleId?: string;
    subjectId?: string;
    tenantId?: string;
}
export type AutomationProactiveDeliveryAttributionInput = Omit<AutomationProactiveDeliveryAttribution, "tenantId"> & {
    tenantId?: string;
};
export interface AutomationProactiveDeliveryCommitInput {
    attemptedAt: string;
    attribution: AutomationProactiveDeliveryAttributionInput;
    attempt: AutomationProactiveDeliveryAttemptInput;
    conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
    descriptor: ConversationOutboundDescriptor;
    evaluatedAt: string;
    idempotencyRecord: AutomationProactiveDeliveryIdempotencyRecordInput;
    outbox: OutboxEvent;
    ruleId: string;
    tenantId: string;
}
export interface AutomationProactiveDeliveryCommitResult {
    descriptorId: string;
    outcome: "cap_exhausted" | "conflicted" | "duplicate" | "queued";
    outboxEventId: string;
}
export interface AutomationScenarioAuditEvent {
    action: string;
    actor: string;
    actorType: "system" | "user";
    auditId: string;
    createdAt: string;
    fingerprint?: string;
    idempotencyKey?: string;
    immutable: true;
    payload: Record<string, unknown>;
    reason: string;
    scenarioId: string;
    tenantId: string;
    traceId: string;
}
export declare const BOT_SCENARIO_RETENTION_DAYS = 30;
/** Immutable publish audit records are never deleted to make a purge succeed. */
export type BotScenarioPurgeOutcome = "audit_hold" | "legal_hold" | "not_eligible" | "purged";
export interface BotScenarioPurgeResult {
    outcome: BotScenarioPurgeOutcome;
    scenarioId: string;
    tenantId: string;
}
export interface AutomationState {
    botPublishAuditEvents: AutomationBotPublishAuditEvent[];
    botScenarios: BotScenario[];
    botScenarioVersions: AutomationBotScenarioVersion[];
    botTestRuns: AutomationBotTestRun[];
    botRuntimeInstances: AutomationBotRuntimeInstance[];
    botRuntimeSteps: AutomationBotRuntimeStep[];
    botRuntimeSideEffects: AutomationBotRuntimeSideEffect[];
    scenarioAuditEvents: AutomationScenarioAuditEvent[];
    proactiveDeliveryAttributions: AutomationProactiveDeliveryAttribution[];
    proactiveDeliveryAttempts: AutomationProactiveDeliveryAttempt[];
    proactiveDeliveryIdempotencyKeys: AutomationProactiveDeliveryIdempotencyRecord[];
    proactiveExecutionWindows: AutomationProactiveExecutionWindow[];
    proactiveExperimentAssignments: AutomationProactiveExperimentAssignment[];
    proactiveFrequencyCaps: AutomationProactiveFrequencyCap[];
    proactiveRules: ProactiveRule[];
    publishIdempotencyKeys: AutomationPublishIdempotencyRecord[];
    activeVisitors?: Array<Record<string, unknown>>;
    rescueChats?: Array<Record<string, unknown>>;
    workspaceAuditEvents: Array<Record<string, unknown>>;
    workspaceRuntimeMetrics: Array<Record<string, unknown>>;
}
type MaybePromise<T> = T | Promise<T>;
export interface PrismaAutomationRepositoryOptions {
    client: PrismaAutomationClient;
    fallback?: AutomationRepository;
}
export interface PrismaAutomationClient {
    $transaction?<TResult>(operation: (client: PrismaProactiveDeliveryTransactionClient) => Promise<TResult>, options?: {
        isolationLevel: "Serializable";
    }): Promise<TResult>;
    automationScenarioAuditEvent: {
        create(input: {
            data: AutomationScenarioAuditEvent;
        }): Promise<AutomationScenarioAuditEvent>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<AutomationScenarioAuditEvent[]>;
        findUnique(input: {
            where: {
                auditId: string;
            } | {
                tenantId_idempotencyKey: {
                    tenantId: string;
                    idempotencyKey: string;
                };
            };
        }): Promise<AutomationScenarioAuditEvent | null>;
    };
    automationBotTestRun: {
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaAutomationBotTestRunRow[]>;
        upsert(input: PrismaAutomationUpsertInput): Promise<PrismaAutomationBotTestRunRow>;
    };
    automationPublishIdempotencyKey: {
        create(input: {
            data: PrismaAutomationPublishIdempotencyKeyRow;
        }): Promise<PrismaAutomationPublishIdempotencyKeyRow>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaAutomationPublishIdempotencyKeyRow[]>;
        findUnique(input: {
            where: PrismaAutomationPublishIdempotencyKeyWhereUniqueInput;
        }): Promise<PrismaAutomationPublishIdempotencyKeyRow | null>;
    };
    automationWorkspaceAuditEvent?: {
        create(input: {
            data: {
                auditId: string;
                createdAt: Date;
                idempotencyKey: string | null;
                payload: Record<string, unknown>;
                tenantId: string;
            };
        }): Promise<{
            payload: unknown;
        }>;
        findMany(input: {
            orderBy: {
                createdAt: "asc";
            };
            where: Record<string, never>;
        }): Promise<Array<{
            payload: unknown;
        }>>;
        findUnique(input: {
            where: {
                auditId: string;
            };
        }): Promise<{
            payload: unknown;
        } | null>;
    };
    botPublishAuditEvent: {
        create(input: {
            data: PrismaBotPublishAuditEventCreateInput;
        }): Promise<PrismaBotPublishAuditEventRow>;
        findMany(input: PrismaBotPublishAuditEventFindManyInput): Promise<PrismaBotPublishAuditEventRow[]>;
        findUnique(input: PrismaBotPublishAuditEventFindUniqueInput): Promise<PrismaBotPublishAuditEventRow | null>;
    };
    botScenario: {
        deleteMany(input: {
            where: Record<string, unknown>;
        }): Promise<{
            count: number;
        }>;
        findMany(input: PrismaBotScenarioFindManyInput): Promise<PrismaBotScenarioRow[]>;
        findUnique(input: PrismaBotScenarioFindUniqueInput): Promise<PrismaBotScenarioRow | null>;
        upsert(input: PrismaBotScenarioUpsertInput): Promise<PrismaBotScenarioRow>;
    };
    botScenarioVersion: {
        create(input: {
            data: PrismaBotScenarioVersionCreateInput;
        }): Promise<PrismaBotScenarioVersionRow>;
        findMany(input: PrismaBotScenarioVersionFindManyInput): Promise<PrismaBotScenarioVersionRow[]>;
        findUnique(input: PrismaBotScenarioVersionFindUniqueInput): Promise<PrismaBotScenarioVersionRow | null>;
    };
    botRuntimeInstance?: PrismaBotRuntimeInstanceDelegate;
    botRuntimeStepJournal?: PrismaBotRuntimeStepDelegate;
    botRuntimeSideEffect?: PrismaBotRuntimeSideEffectDelegate;
    proactiveDeliveryAttempt: {
        create(input: {
            data: PrismaProactiveDeliveryAttemptRow;
        }): Promise<PrismaProactiveDeliveryAttemptRow>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryAttemptRow[]>;
        findUnique(input: {
            where: {
                attemptId: string;
            };
        }): Promise<PrismaProactiveDeliveryAttemptRow | null>;
    };
    proactiveDeliveryAttribution: {
        create(input: {
            data: PrismaProactiveDeliveryAttributionRow;
        }): Promise<PrismaProactiveDeliveryAttributionRow>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryAttributionRow[]>;
        findUnique(input: {
            where: {
                attributionId: string;
            };
        }): Promise<PrismaProactiveDeliveryAttributionRow | null>;
    };
    proactiveDeliveryIdempotencyKey: {
        create(input: {
            data: PrismaProactiveDeliveryIdempotencyKeyRow;
        }): Promise<PrismaProactiveDeliveryIdempotencyKeyRow>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryIdempotencyKeyRow[]>;
        findUnique(input: {
            where: {
                key: string;
            };
        }): Promise<PrismaProactiveDeliveryIdempotencyKeyRow | null>;
    };
    proactiveExecutionWindow: {
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveExecutionWindowRow[]>;
        upsert(input: PrismaAutomationUpsertInput): Promise<PrismaProactiveExecutionWindowRow>;
    };
    proactiveExperimentAssignment: {
        create(input: {
            data: PrismaProactiveExperimentAssignmentRow;
        }): Promise<PrismaProactiveExperimentAssignmentRow>;
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveExperimentAssignmentRow[]>;
        findUnique(input: {
            where: {
                assignmentId: string;
            };
        }): Promise<PrismaProactiveExperimentAssignmentRow | null>;
    };
    proactiveFrequencyCap: {
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveFrequencyCapRow[]>;
        updateMany?(input: {
            data: Record<string, unknown>;
            where: Record<string, unknown>;
        }): Promise<{
            count: number;
        }>;
        upsert(input: PrismaAutomationUpsertInput): Promise<PrismaProactiveFrequencyCapRow>;
    };
    proactiveRule: {
        findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveRuleRow[]>;
        upsert(input: PrismaAutomationUpsertInput): Promise<PrismaProactiveRuleRow>;
    };
    conversationOutboundDescriptor?: PrismaAtomicConversationOutboundDescriptorDelegate;
    outboxEvent?: PrismaAtomicOutboxEventDelegate;
}
interface AutomationRepositoryPort {
    claimBotRuntimeRetry(id: string, expectedAttempts: number, now: string, leaseUntil: string): MaybePromise<AutomationBotRuntimeInstance | undefined>;
    claimBotRuntimeSideEffect(id: string, now: string, leaseUntil: string): MaybePromise<AutomationBotRuntimeSideEffect | undefined>;
    findLatestBotRuntimeStep(runtimeId: string): MaybePromise<AutomationBotRuntimeStep | undefined>;
    listDueBotRuntimeRetries(now: string, limit: number): MaybePromise<AutomationBotRuntimeInstance[]>;
    listDueBotRuntimeSideEffects(now: string, limit: number): MaybePromise<AutomationBotRuntimeSideEffect[]>;
    updateBotRuntimeSideEffect(effect: AutomationBotRuntimeSideEffect): MaybePromise<AutomationBotRuntimeSideEffect>;
    commitBotRuntimeTransition(input: AutomationBotRuntimeCommitInput): MaybePromise<AutomationBotRuntimeCommitResult>;
    findBotRuntimeInstance(tenantId: string, conversationId: string): MaybePromise<AutomationBotRuntimeInstance | undefined>;
    listBotRuntimeInstances(tenantId: string): MaybePromise<AutomationBotRuntimeInstance[]>;
    findBotRuntimeStep(tenantId: string, conversationId: string, inputEventId: string): MaybePromise<AutomationBotRuntimeStep | undefined>;
    findBotPublishAuditEvent(auditId: string): MaybePromise<AutomationBotPublishAuditEvent | undefined>;
    findBotScenario(scenarioId: string): MaybePromise<BotScenario | undefined>;
    findBotScenarioVersion(versionId: string): MaybePromise<AutomationBotScenarioVersion | undefined>;
    findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined;
    findPublishIdempotencyKey(tenantId: string, key: string): AutomationPublishIdempotencyRecord | undefined;
    listBotPublishAuditEvents(scenarioId: string): MaybePromise<AutomationBotPublishAuditEvent[]>;
    listBotScenarios(): MaybePromise<BotScenario[]>;
    listScenarioAuditEvents(scenarioId: string, tenantId: string): MaybePromise<AutomationScenarioAuditEvent[]>;
    listExpiredArchivedBotScenarios(now: string, limit: number): MaybePromise<BotScenario[]>;
    listBotScenarioVersions(scenarioId: string): MaybePromise<AutomationBotScenarioVersion[]>;
    listProactiveDeliveryAttributions(filter?: AutomationProactiveDeliveryAttributionFilter): AutomationProactiveDeliveryAttribution[];
    listProactiveDeliveryAttempts(filter?: AutomationProactiveDeliveryAttemptFilter): AutomationProactiveDeliveryAttempt[];
    listProactiveExecutionWindows(filter?: AutomationProactiveExecutionWindowFilter): AutomationProactiveExecutionWindow[];
    listProactiveExperimentAssignments(filter?: AutomationProactiveExperimentAssignmentFilter): AutomationProactiveExperimentAssignment[];
    listProactiveFrequencyCaps(filter?: AutomationProactiveFrequencyCapFilter): AutomationProactiveFrequencyCap[];
    listProactiveRules(): ProactiveRule[];
    readState(): AutomationState;
    saveBotPublishAuditEvent(event: AutomationBotPublishAuditEvent): MaybePromise<AutomationBotPublishAuditEvent>;
    saveBotScenario(scenario: BotScenario): MaybePromise<BotScenario>;
    saveScenarioAuditEvent(event: AutomationScenarioAuditEvent): MaybePromise<AutomationScenarioAuditEvent>;
    saveWorkspaceAuditEvent(event: Record<string, unknown>): MaybePromise<Record<string, unknown>>;
    purgeArchivedBotScenario(tenantId: string, scenarioId: string, now: string): MaybePromise<BotScenarioPurgeResult>;
    saveBotScenarioVersion(version: AutomationBotScenarioVersion): MaybePromise<AutomationBotScenarioVersion>;
    saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun;
    saveProactiveDeliveryAttribution(attribution: AutomationProactiveDeliveryAttributionInput): AutomationProactiveDeliveryAttribution;
    saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt;
    saveProactiveDeliveryIdempotencyKey(record: AutomationProactiveDeliveryIdempotencyRecordInput): AutomationProactiveDeliveryIdempotencyRecord;
    saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow;
    saveProactiveExperimentAssignment(assignment: AutomationProactiveExperimentAssignmentInput): AutomationProactiveExperimentAssignment;
    saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap;
    saveProactiveRule(rule: ProactiveRule): ProactiveRule;
    savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord;
}
interface PrismaAutomationFindManyInput {
    orderBy?: Record<string, unknown>;
    where?: Record<string, unknown>;
}
interface PrismaAutomationUpsertInput {
    create: unknown;
    update: unknown;
    where: Record<string, unknown>;
}
interface PrismaProactiveDeliveryTransactionClient {
    botRuntimeSideEffect?: PrismaBotRuntimeSideEffectDelegate;
    botRuntimeInstance?: PrismaBotRuntimeInstanceDelegate;
    botRuntimeStepJournal?: PrismaBotRuntimeStepDelegate;
    conversationOutboundDescriptor: PrismaAtomicConversationOutboundDescriptorDelegate;
    outboxEvent: PrismaAtomicOutboxEventDelegate;
    proactiveDeliveryAttempt: PrismaAutomationClient["proactiveDeliveryAttempt"];
    proactiveDeliveryAttribution: PrismaAutomationClient["proactiveDeliveryAttribution"];
    proactiveDeliveryIdempotencyKey: PrismaAutomationClient["proactiveDeliveryIdempotencyKey"];
    proactiveFrequencyCap: PrismaAutomationClient["proactiveFrequencyCap"] & {
        updateMany(input: {
            data: Record<string, unknown>;
            where: Record<string, unknown>;
        }): Promise<{
            count: number;
        }>;
    };
}
interface PrismaAtomicConversationOutboundDescriptorDelegate {
    create(input: {
        data: PrismaAtomicConversationOutboundDescriptorRow;
    }): Promise<PrismaAtomicConversationOutboundDescriptorRow>;
    findUnique(input: {
        where: {
            idempotencyKey: string;
        };
    }): Promise<PrismaAtomicConversationOutboundDescriptorRow | null>;
}
interface PrismaAtomicOutboxEventDelegate {
    create(input: {
        data: PrismaAtomicOutboxEventRow;
    }): Promise<PrismaAtomicOutboxEventRow>;
}
interface PrismaBotRuntimeInstanceDelegate {
    create(input: {
        data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findMany(input: {
        orderBy?: Record<string, unknown>;
        take?: number;
        where: Record<string, unknown>;
    }): Promise<Array<Record<string, unknown>>>;
    findUnique(input: {
        where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null>;
    updateMany(input: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
    }): Promise<{
        count: number;
    }>;
}
interface PrismaBotRuntimeStepDelegate {
    create(input: {
        data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findMany(input: {
        orderBy?: Record<string, unknown>;
        take?: number;
        where: Record<string, unknown>;
    }): Promise<Array<Record<string, unknown>>>;
    findUnique(input: {
        where: Record<string, unknown>;
    }): Promise<Record<string, unknown> | null>;
}
interface PrismaBotRuntimeSideEffectDelegate {
    create(input: {
        data: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
    findMany(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    findUnique(input: {
        where: {
            id: string;
        };
    }): Promise<Record<string, unknown> | null>;
    update(input: {
        data: Record<string, unknown>;
        where: {
            id: string;
        };
    }): Promise<Record<string, unknown>>;
    updateMany(input: {
        data: Record<string, unknown>;
        where: Record<string, unknown>;
    }): Promise<{
        count: number;
    }>;
}
interface PrismaAtomicConversationOutboundDescriptorRow {
    auditId: string | null;
    channel: string;
    conversationId: string | null;
    createdAt: Date | string;
    deliveryState: string | null;
    id: string;
    idempotencyKey: string | null;
    kind: string;
    messageId: string | null;
    outboxEventId: string | null;
    payload: Record<string, unknown>;
    requestFingerprint: string | null;
    retryable: boolean;
    status: string;
    tenantId: string;
    traceId: string;
}
interface PrismaAtomicOutboxEventRow {
    aggregateId: string;
    aggregateType: string;
    id: string;
    occurredAt: Date | string;
    payload: Record<string, unknown>;
    queue: string;
    status: string;
    traceId: string;
    type: string;
}
interface PrismaBotScenarioFindManyInput {
    orderBy: {
        updatedAt: "desc";
    };
    take?: number;
    where?: Record<string, unknown>;
}
interface PrismaBotScenarioFindUniqueInput {
    where: {
        id: string;
    };
}
interface PrismaBotScenarioUpsertInput {
    create: PrismaBotScenarioCreateInput;
    update: PrismaBotScenarioUpdateInput;
    where: {
        id: string;
    };
}
interface PrismaBotScenarioCreateInput {
    activeVersionId?: string | null;
    auditHold: boolean;
    auditHoldAt?: Date | null;
    auditHoldBy?: string | null;
    auditHoldReason?: string | null;
    archiveReason?: string | null;
    archivedAt?: Date | null;
    archivedBy?: string | null;
    basePrompt?: string | null;
    channels: string[];
    createdAt: Date;
    disabledAt?: Date | null;
    disabledBy?: string | null;
    disableReason?: string | null;
    draft?: unknown;
    enabled: boolean;
    flowEdges: unknown;
    flowNodes: unknown;
    id: string;
    name: string;
    legalHold: boolean;
    legalHoldAt?: Date | null;
    legalHoldBy?: string | null;
    legalHoldReason?: string | null;
    priority: number;
    retentionUntil?: Date | null;
    sourceBindings: unknown;
    schemaVersion: string;
    status: string;
    tenantId: string;
    triggerRules: unknown;
    updatedAt: Date;
}
type PrismaBotScenarioUpdateInput = Omit<PrismaBotScenarioCreateInput, "createdAt" | "id" | "updatedAt">;
interface PrismaBotScenarioRow {
    activeVersionId?: string | null;
    auditHold?: boolean;
    auditHoldAt?: Date | string | null;
    auditHoldBy?: string | null;
    auditHoldReason?: string | null;
    archiveReason?: string | null;
    archivedAt?: Date | string | null;
    archivedBy?: string | null;
    basePrompt?: string | null;
    channels: string[];
    createdAt: Date | string;
    disabledAt?: Date | string | null;
    disabledBy?: string | null;
    disableReason?: string | null;
    draft?: unknown;
    enabled?: boolean;
    flowEdges: unknown;
    flowNodes: unknown;
    id: string;
    legalHold?: boolean;
    legalHoldAt?: Date | string | null;
    legalHoldBy?: string | null;
    legalHoldReason?: string | null;
    name: string;
    priority?: number;
    retentionUntil?: Date | string | null;
    sourceBindings?: unknown;
    schemaVersion: string;
    status: string;
    tenantId: string;
    triggerRules?: unknown;
    updatedAt: Date | string;
}
interface PrismaBotScenarioVersionFindManyInput {
    orderBy: {
        createdAt: "asc";
    };
    where?: {
        scenarioId?: string;
    };
}
interface PrismaBotScenarioVersionFindUniqueInput {
    where: {
        versionId: string;
    };
}
interface PrismaBotScenarioVersionCreateInput {
    basePrompt?: string | null;
    createdAt: Date;
    flowEdges: unknown;
    flowNodes: unknown;
    priority: number;
    scenarioId: string;
    sourceBindings: unknown;
    status: string;
    tenantId: string;
    triggerRules: unknown;
    versionId: string;
}
interface PrismaBotScenarioVersionRow {
    basePrompt?: string | null;
    createdAt: Date | string;
    flowEdges: unknown;
    flowNodes: unknown;
    priority?: number;
    scenarioId: string;
    sourceBindings?: unknown;
    status: string;
    tenantId: string;
    triggerRules?: unknown;
    versionId: string;
}
interface PrismaBotPublishAuditEventFindManyInput {
    orderBy: {
        createdAt: "asc";
    };
    where?: {
        scenarioId?: string;
    };
}
interface PrismaBotPublishAuditEventFindUniqueInput {
    where: {
        auditId: string;
    } | {
        idempotencyKey: string;
    };
}
interface PrismaBotPublishAuditEventCreateInput {
    action: string;
    actor: string;
    auditId: string;
    createdAt: Date;
    idempotencyKey: string;
    immutable: boolean;
    runtimeVersion: string;
    scenarioId: string;
    tenantId: string;
    versionId: string;
}
interface PrismaBotPublishAuditEventRow {
    action: string;
    actor: string;
    auditId: string;
    createdAt: Date | string;
    idempotencyKey: string;
    immutable: boolean;
    runtimeVersion: string;
    scenarioId: string;
    tenantId: string;
    versionId: string;
}
interface PrismaAutomationPublishIdempotencyKeyRow {
    fingerprint: string;
    key: string;
    result: unknown;
    tenantId: string;
}
interface PrismaAutomationPublishIdempotencyKeyWhereUniqueInput {
    tenantId_key: {
        key: string;
        tenantId: string;
    };
}
interface PrismaAutomationBotTestRunRow {
    auditId: string;
    cases: unknown;
    queue: string;
    scenarioId: string;
    status: string;
    tenantId: string | null;
    testRunId: string;
}
interface PrismaProactiveRuleRow {
    activeVariant: string | null;
    channels: string[];
    cooldown: string | null;
    id: string;
    segment: string | null;
    status: string | null;
    tenantId: string;
}
interface PrismaProactiveExecutionWindowRow {
    active: boolean;
    daysOfWeek: number[];
    endsAt: string;
    ruleId: string;
    startsAt: string;
    tenantId: string;
    timezone: string;
    windowId: string;
}
interface PrismaProactiveFrequencyCapRow {
    active: boolean;
    capId: string;
    limit: number;
    period: string;
    resetAt: Date | string;
    ruleId: string;
    tenantId: string;
    used: number;
}
interface PrismaProactiveExperimentAssignmentRow {
    assignedAt: Date | string;
    assignmentId: string;
    experimentId: string;
    ruleId: string;
    subjectId: string;
    tenantId: string;
    variant: string;
}
interface PrismaProactiveDeliveryAttemptRow {
    attemptedAt: Date | string;
    attemptId: string;
    channel: string;
    descriptorId: string;
    ruleId: string;
    status: string;
    subjectId: string;
    tenantId: string;
    traceId: string;
}
interface PrismaProactiveDeliveryIdempotencyKeyRow {
    fingerprint: string;
    key: string;
    result: unknown;
    ruleId: string;
    subjectId: string;
    tenantId: string;
}
interface PrismaProactiveDeliveryAttributionRow {
    assignedAt: Date | string;
    attributionId: string;
    descriptorId: string;
    experimentId: string;
    ruleId: string;
    subjectId: string;
    tenantId: string;
    variant: string;
}
export declare class AutomationRepository implements AutomationRepositoryPort {
    private readonly store;
    private readonly adapter?;
    private constructor();
    static default(): AutomationRepository;
    static useDefault(repository: AutomationRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: AutomationState): AutomationRepository;
    static prisma({ client, fallback }: PrismaAutomationRepositoryOptions): AutomationRepository;
    listDueBotRuntimeRetriesAsync(now: string, limit: number): Promise<AutomationBotRuntimeInstance[]>;
    listDueBotRuntimeRetries(now: string, limit: number): AutomationBotRuntimeInstance[];
    claimBotRuntimeRetryAsync(id: string, expectedAttempts: number, now: string, leaseUntil: string): Promise<AutomationBotRuntimeInstance | undefined>;
    claimBotRuntimeRetry(id: string, expectedAttempts: number, now: string, leaseUntil: string): AutomationBotRuntimeInstance | undefined;
    findLatestBotRuntimeStepAsync(runtimeId: string): Promise<AutomationBotRuntimeStep | undefined>;
    findLatestBotRuntimeStep(runtimeId: string): AutomationBotRuntimeStep | undefined;
    listDueBotRuntimeSideEffectsAsync(now: string, limit: number): Promise<AutomationBotRuntimeSideEffect[]>;
    listDueBotRuntimeSideEffects(now: string, limit: number): AutomationBotRuntimeSideEffect[];
    claimBotRuntimeSideEffectAsync(id: string, now: string, leaseUntil: string): Promise<AutomationBotRuntimeSideEffect | undefined>;
    claimBotRuntimeSideEffect(id: string, now: string, leaseUntil: string): AutomationBotRuntimeSideEffect | undefined;
    updateBotRuntimeSideEffectAsync(effect: AutomationBotRuntimeSideEffect): Promise<AutomationBotRuntimeSideEffect>;
    updateBotRuntimeSideEffect(effect: AutomationBotRuntimeSideEffect): AutomationBotRuntimeSideEffect;
    findBotRuntimeInstanceAsync(tenantId: string, conversationId: string): Promise<AutomationBotRuntimeInstance | undefined>;
    findBotRuntimeInstance(tenantId: string, conversationId: string): AutomationBotRuntimeInstance | undefined;
    listBotRuntimeInstancesAsync(tenantId: string): Promise<AutomationBotRuntimeInstance[]>;
    listBotRuntimeInstances(tenantId: string): AutomationBotRuntimeInstance[];
    findBotRuntimeStepAsync(tenantId: string, conversationId: string, inputEventId: string): Promise<AutomationBotRuntimeStep | undefined>;
    findBotRuntimeStep(tenantId: string, conversationId: string, inputEventId: string): AutomationBotRuntimeStep | undefined;
    commitBotRuntimeTransitionAsync(input: AutomationBotRuntimeCommitInput): Promise<AutomationBotRuntimeCommitResult>;
    commitBotRuntimeTransition(input: AutomationBotRuntimeCommitInput): AutomationBotRuntimeCommitResult;
    commitProactiveDeliveryAsync(input: AutomationProactiveDeliveryCommitInput): Promise<AutomationProactiveDeliveryCommitResult>;
    readStateAsync(): Promise<AutomationState>;
    readState(): AutomationState;
    findPublishIdempotencyKeyAsync(tenantId: string, key: string): Promise<AutomationPublishIdempotencyRecord | undefined>;
    findPublishIdempotencyKey(tenantId: string, key: string): AutomationPublishIdempotencyRecord | undefined;
    findProactiveDeliveryIdempotencyKeyAsync(key: string): Promise<AutomationProactiveDeliveryIdempotencyRecord | undefined>;
    findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined;
    savePublishIdempotencyKeyAsync(record: AutomationPublishIdempotencyRecord): Promise<AutomationPublishIdempotencyRecord>;
    savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord;
    saveProactiveDeliveryIdempotencyKeyAsync(record: AutomationProactiveDeliveryIdempotencyRecordInput): Promise<AutomationProactiveDeliveryIdempotencyRecord>;
    saveProactiveDeliveryIdempotencyKey(record: AutomationProactiveDeliveryIdempotencyRecordInput): AutomationProactiveDeliveryIdempotencyRecord;
    listBotScenarios(): MaybePromise<BotScenario[]>;
    listExpiredArchivedBotScenarios(now: string, limit: number): MaybePromise<BotScenario[]>;
    listExpiredArchivedBotScenariosAsync(now: string, limit: number): Promise<BotScenario[]>;
    findBotScenario(scenarioId: string): MaybePromise<BotScenario | undefined>;
    saveBotScenario(scenario: BotScenario): MaybePromise<BotScenario>;
    findBotScenarioVersion(versionId: string): MaybePromise<AutomationBotScenarioVersion | undefined>;
    listBotScenarioVersions(scenarioId: string): MaybePromise<AutomationBotScenarioVersion[]>;
    saveBotScenarioVersion(version: AutomationBotScenarioVersion): MaybePromise<AutomationBotScenarioVersion>;
    findBotPublishAuditEvent(auditId: string): MaybePromise<AutomationBotPublishAuditEvent | undefined>;
    listBotPublishAuditEvents(scenarioId: string): MaybePromise<AutomationBotPublishAuditEvent[]>;
    saveBotPublishAuditEvent(event: AutomationBotPublishAuditEvent): MaybePromise<AutomationBotPublishAuditEvent>;
    purgeArchivedBotScenario(tenantId: string, scenarioId: string, now: string): MaybePromise<BotScenarioPurgeResult>;
    purgeArchivedBotScenarioAsync(tenantId: string, scenarioId: string, now: string): Promise<BotScenarioPurgeResult>;
    /** Append-only tenant-scoped projection for scenario lifecycle actions. */
    saveScenarioAuditEvent(event: AutomationScenarioAuditEvent): Promise<AutomationScenarioAuditEvent>;
    listScenarioAuditEvents(scenarioId: string, tenantId: string): AutomationScenarioAuditEvent[];
    saveWorkspaceAuditEvent(event: Record<string, unknown>): MaybePromise<Record<string, unknown>>;
    listProactiveRulesAsync(): Promise<ProactiveRule[]>;
    listProactiveRules(): ProactiveRule[];
    listProactiveExecutionWindowsAsync(filter?: AutomationProactiveExecutionWindowFilter): Promise<AutomationProactiveExecutionWindow[]>;
    listProactiveExecutionWindows(filter?: AutomationProactiveExecutionWindowFilter): AutomationProactiveExecutionWindow[];
    saveProactiveExecutionWindowAsync(window: AutomationProactiveExecutionWindowInput): Promise<AutomationProactiveExecutionWindow>;
    saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow;
    listProactiveFrequencyCapsAsync(filter?: AutomationProactiveFrequencyCapFilter): Promise<AutomationProactiveFrequencyCap[]>;
    listProactiveFrequencyCaps(filter?: AutomationProactiveFrequencyCapFilter): AutomationProactiveFrequencyCap[];
    saveProactiveFrequencyCapAsync(cap: AutomationProactiveFrequencyCapInput): Promise<AutomationProactiveFrequencyCap>;
    saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap;
    listProactiveExperimentAssignmentsAsync(filter?: AutomationProactiveExperimentAssignmentFilter): Promise<AutomationProactiveExperimentAssignment[]>;
    listProactiveExperimentAssignments(filter?: AutomationProactiveExperimentAssignmentFilter): AutomationProactiveExperimentAssignment[];
    saveProactiveExperimentAssignmentAsync(assignment: AutomationProactiveExperimentAssignmentInput): Promise<AutomationProactiveExperimentAssignment>;
    saveProactiveExperimentAssignment(assignment: AutomationProactiveExperimentAssignmentInput): AutomationProactiveExperimentAssignment;
    listProactiveDeliveryAttemptsAsync(filter?: AutomationProactiveDeliveryAttemptFilter): Promise<AutomationProactiveDeliveryAttempt[]>;
    listProactiveDeliveryAttempts(filter?: AutomationProactiveDeliveryAttemptFilter): AutomationProactiveDeliveryAttempt[];
    saveProactiveDeliveryAttemptAsync(attempt: AutomationProactiveDeliveryAttemptInput): Promise<AutomationProactiveDeliveryAttempt>;
    saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt;
    listProactiveDeliveryAttributionsAsync(filter?: AutomationProactiveDeliveryAttributionFilter): Promise<AutomationProactiveDeliveryAttribution[]>;
    listProactiveDeliveryAttributions(filter?: AutomationProactiveDeliveryAttributionFilter): AutomationProactiveDeliveryAttribution[];
    saveProactiveDeliveryAttributionAsync(attribution: AutomationProactiveDeliveryAttributionInput): Promise<AutomationProactiveDeliveryAttribution>;
    saveProactiveDeliveryAttribution(attribution: AutomationProactiveDeliveryAttributionInput): AutomationProactiveDeliveryAttribution;
    saveProactiveRuleAsync(rule: ProactiveRule): Promise<ProactiveRule>;
    saveProactiveRule(rule: ProactiveRule): ProactiveRule;
    saveBotTestRunAsync(run: AutomationBotTestRun): Promise<AutomationBotTestRun>;
    saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun;
}
export declare function createEmptyAutomationState(): AutomationState;
export {};
