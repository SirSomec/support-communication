import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { OutboxEvent } from "@support-communication/events";
import type {
  ConversationOutboundDescriptor,
  ConversationRepository
} from "../conversation/conversation.repository.js";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { bootstrapAutomationState } from "./seed.js";
import type { BotScenario, ProactiveRule } from "./automation.types.js";

export interface AutomationPublishIdempotencyRecord {
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
}

export interface AutomationBotTestRun {
  auditId: string;
  cases: Array<Record<string, unknown>>;
  queue: string;
  scenarioId: string;
  status: string;
  tenantId?: string;
  testRunId: string;
}

export interface AutomationBotScenarioVersion {
  createdAt: string;
  flowEdges: BotScenario["flowEdges"];
  flowNodes: BotScenario["flowNodes"];
  scenarioId: string;
  status: string;
  tenantId?: string;
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
  tenantId?: string;
  versionId: string;
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

export interface AutomationState {
  botPublishAuditEvents: AutomationBotPublishAuditEvent[];
  botScenarios: BotScenario[];
  botScenarioVersions: AutomationBotScenarioVersion[];
  botTestRuns: AutomationBotTestRun[];
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

interface AutomationRepositoryOptions {
  filePath: string;
}

type MaybePromise<T> = T | Promise<T>;

export interface PrismaAutomationRepositoryOptions {
  client: PrismaAutomationClient;
  fallback?: AutomationRepository;
}

export interface PrismaAutomationClient {
  $transaction?<TResult>(
    operation: (client: PrismaProactiveDeliveryTransactionClient) => Promise<TResult>,
    options?: { isolationLevel: "Serializable" }
  ): Promise<TResult>;
  automationBotTestRun: {
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaAutomationBotTestRunRow[]>;
    upsert(input: PrismaAutomationUpsertInput): Promise<PrismaAutomationBotTestRunRow>;
  };
  automationPublishIdempotencyKey: {
    create(input: { data: PrismaAutomationPublishIdempotencyKeyRow }): Promise<PrismaAutomationPublishIdempotencyKeyRow>;
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaAutomationPublishIdempotencyKeyRow[]>;
    findUnique(input: { where: { key: string } }): Promise<PrismaAutomationPublishIdempotencyKeyRow | null>;
  };
  botPublishAuditEvent: {
    create(input: { data: PrismaBotPublishAuditEventCreateInput }): Promise<PrismaBotPublishAuditEventRow>;
    findMany(input: PrismaBotPublishAuditEventFindManyInput): Promise<PrismaBotPublishAuditEventRow[]>;
    findUnique(input: PrismaBotPublishAuditEventFindUniqueInput): Promise<PrismaBotPublishAuditEventRow | null>;
  };
  botScenario: {
    findMany(input: PrismaBotScenarioFindManyInput): Promise<PrismaBotScenarioRow[]>;
    findUnique(input: PrismaBotScenarioFindUniqueInput): Promise<PrismaBotScenarioRow | null>;
    upsert(input: PrismaBotScenarioUpsertInput): Promise<PrismaBotScenarioRow>;
  };
  botScenarioVersion: {
    create(input: { data: PrismaBotScenarioVersionCreateInput }): Promise<PrismaBotScenarioVersionRow>;
    findMany(input: PrismaBotScenarioVersionFindManyInput): Promise<PrismaBotScenarioVersionRow[]>;
    findUnique(input: PrismaBotScenarioVersionFindUniqueInput): Promise<PrismaBotScenarioVersionRow | null>;
  };
  proactiveDeliveryAttempt: {
    create(input: { data: PrismaProactiveDeliveryAttemptRow }): Promise<PrismaProactiveDeliveryAttemptRow>;
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryAttemptRow[]>;
    findUnique(input: { where: { attemptId: string } }): Promise<PrismaProactiveDeliveryAttemptRow | null>;
  };
  proactiveDeliveryAttribution: {
    create(input: { data: PrismaProactiveDeliveryAttributionRow }): Promise<PrismaProactiveDeliveryAttributionRow>;
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryAttributionRow[]>;
    findUnique(input: { where: { attributionId: string } }): Promise<PrismaProactiveDeliveryAttributionRow | null>;
  };
  proactiveDeliveryIdempotencyKey: {
    create(input: { data: PrismaProactiveDeliveryIdempotencyKeyRow }): Promise<PrismaProactiveDeliveryIdempotencyKeyRow>;
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveDeliveryIdempotencyKeyRow[]>;
    findUnique(input: { where: { key: string } }): Promise<PrismaProactiveDeliveryIdempotencyKeyRow | null>;
  };
  proactiveExecutionWindow: {
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveExecutionWindowRow[]>;
    upsert(input: PrismaAutomationUpsertInput): Promise<PrismaProactiveExecutionWindowRow>;
  };
  proactiveExperimentAssignment: {
    create(input: { data: PrismaProactiveExperimentAssignmentRow }): Promise<PrismaProactiveExperimentAssignmentRow>;
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveExperimentAssignmentRow[]>;
    findUnique(input: { where: { assignmentId: string } }): Promise<PrismaProactiveExperimentAssignmentRow | null>;
  };
  proactiveFrequencyCap: {
    findMany(input?: PrismaAutomationFindManyInput): Promise<PrismaProactiveFrequencyCapRow[]>;
    updateMany?(input: {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    }): Promise<{ count: number }>;
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
  findBotPublishAuditEvent(auditId: string): MaybePromise<AutomationBotPublishAuditEvent | undefined>;
  findBotScenario(scenarioId: string): MaybePromise<BotScenario | undefined>;
  findBotScenarioVersion(versionId: string): MaybePromise<AutomationBotScenarioVersion | undefined>;
  findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined;
  findPublishIdempotencyKey(key: string): AutomationPublishIdempotencyRecord | undefined;
  listBotPublishAuditEvents(scenarioId: string): MaybePromise<AutomationBotPublishAuditEvent[]>;
  listBotScenarios(): MaybePromise<BotScenario[]>;
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
  saveBotScenarioVersion(version: AutomationBotScenarioVersion): MaybePromise<AutomationBotScenarioVersion>;
  saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun;
  saveProactiveDeliveryAttribution(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): AutomationProactiveDeliveryAttribution;
  saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt;
  saveProactiveDeliveryIdempotencyKey(record: AutomationProactiveDeliveryIdempotencyRecordInput): AutomationProactiveDeliveryIdempotencyRecord;
  saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow;
  saveProactiveExperimentAssignment(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): AutomationProactiveExperimentAssignment;
  saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap;
  saveProactiveRule(rule: ProactiveRule): ProactiveRule;
  savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord;
}

interface AutomationRepositoryAsyncPort {
  commitProactiveDeliveryAsync(
    input: AutomationProactiveDeliveryCommitInput
  ): Promise<AutomationProactiveDeliveryCommitResult>;
  findProactiveDeliveryIdempotencyKeyAsync(key: string): Promise<AutomationProactiveDeliveryIdempotencyRecord | undefined>;
  findPublishIdempotencyKeyAsync(key: string): Promise<AutomationPublishIdempotencyRecord | undefined>;
  listProactiveDeliveryAttributionsAsync(filter?: AutomationProactiveDeliveryAttributionFilter): Promise<AutomationProactiveDeliveryAttribution[]>;
  listProactiveDeliveryAttemptsAsync(filter?: AutomationProactiveDeliveryAttemptFilter): Promise<AutomationProactiveDeliveryAttempt[]>;
  listProactiveExecutionWindowsAsync(filter?: AutomationProactiveExecutionWindowFilter): Promise<AutomationProactiveExecutionWindow[]>;
  listProactiveExperimentAssignmentsAsync(filter?: AutomationProactiveExperimentAssignmentFilter): Promise<AutomationProactiveExperimentAssignment[]>;
  listProactiveFrequencyCapsAsync(filter?: AutomationProactiveFrequencyCapFilter): Promise<AutomationProactiveFrequencyCap[]>;
  listProactiveRulesAsync(): Promise<ProactiveRule[]>;
  readStateAsync(): Promise<AutomationState>;
  saveBotTestRunAsync(run: AutomationBotTestRun): Promise<AutomationBotTestRun>;
  saveProactiveDeliveryAttributionAsync(attribution: AutomationProactiveDeliveryAttributionInput): Promise<AutomationProactiveDeliveryAttribution>;
  saveProactiveDeliveryAttemptAsync(attempt: AutomationProactiveDeliveryAttemptInput): Promise<AutomationProactiveDeliveryAttempt>;
  saveProactiveDeliveryIdempotencyKeyAsync(record: AutomationProactiveDeliveryIdempotencyRecordInput): Promise<AutomationProactiveDeliveryIdempotencyRecord>;
  saveProactiveExecutionWindowAsync(window: AutomationProactiveExecutionWindowInput): Promise<AutomationProactiveExecutionWindow>;
  saveProactiveExperimentAssignmentAsync(assignment: AutomationProactiveExperimentAssignmentInput): Promise<AutomationProactiveExperimentAssignment>;
  saveProactiveFrequencyCapAsync(cap: AutomationProactiveFrequencyCapInput): Promise<AutomationProactiveFrequencyCap>;
  saveProactiveRuleAsync(rule: ProactiveRule): Promise<ProactiveRule>;
  savePublishIdempotencyKeyAsync(record: AutomationPublishIdempotencyRecord): Promise<AutomationPublishIdempotencyRecord>;
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
  conversationOutboundDescriptor: PrismaAtomicConversationOutboundDescriptorDelegate;
  outboxEvent: PrismaAtomicOutboxEventDelegate;
  proactiveDeliveryAttempt: PrismaAutomationClient["proactiveDeliveryAttempt"];
  proactiveDeliveryAttribution: PrismaAutomationClient["proactiveDeliveryAttribution"];
  proactiveDeliveryIdempotencyKey: PrismaAutomationClient["proactiveDeliveryIdempotencyKey"];
  proactiveFrequencyCap: PrismaAutomationClient["proactiveFrequencyCap"] & {
    updateMany(input: {
      data: Record<string, unknown>;
      where: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

interface PrismaAtomicConversationOutboundDescriptorDelegate {
  create(input: { data: PrismaAtomicConversationOutboundDescriptorRow }): Promise<PrismaAtomicConversationOutboundDescriptorRow>;
  findUnique(input: { where: { idempotencyKey: string } }): Promise<PrismaAtomicConversationOutboundDescriptorRow | null>;
}

interface PrismaAtomicOutboxEventDelegate {
  create(input: { data: PrismaAtomicOutboxEventRow }): Promise<PrismaAtomicOutboxEventRow>;
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
  orderBy: { updatedAt: "desc" };
}

interface PrismaBotScenarioFindUniqueInput {
  where: { id: string };
}

interface PrismaBotScenarioUpsertInput {
  create: PrismaBotScenarioCreateInput;
  update: PrismaBotScenarioUpdateInput;
  where: { id: string };
}

interface PrismaBotScenarioCreateInput {
  channels: string[];
  createdAt: Date;
  flowEdges: unknown;
  flowNodes: unknown;
  id: string;
  name: string;
  schemaVersion: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
}

type PrismaBotScenarioUpdateInput = Omit<PrismaBotScenarioCreateInput, "createdAt" | "id" | "updatedAt">;

interface PrismaBotScenarioRow {
  channels: string[];
  createdAt: Date | string;
  flowEdges: unknown;
  flowNodes: unknown;
  id: string;
  name: string;
  schemaVersion: string;
  status: string;
  tenantId: string;
  updatedAt: Date | string;
}

interface PrismaBotScenarioVersionFindManyInput {
  orderBy: { createdAt: "asc" };
  where?: { scenarioId?: string };
}

interface PrismaBotScenarioVersionFindUniqueInput {
  where: { versionId: string };
}

interface PrismaBotScenarioVersionCreateInput {
  createdAt: Date;
  flowEdges: unknown;
  flowNodes: unknown;
  scenarioId: string;
  status: string;
  tenantId: string;
  versionId: string;
}

interface PrismaBotScenarioVersionRow {
  createdAt: Date | string;
  flowEdges: unknown;
  flowNodes: unknown;
  scenarioId: string;
  status: string;
  tenantId: string;
  versionId: string;
}

interface PrismaBotPublishAuditEventFindManyInput {
  orderBy: { createdAt: "asc" };
  where?: { scenarioId?: string };
}

interface PrismaBotPublishAuditEventFindUniqueInput {
  where: { auditId: string } | { idempotencyKey: string };
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

let defaultRepository: AutomationRepository | null = null;

function hasAsyncAutomationPort(
  port: AutomationRepositoryPort
): port is AutomationRepositoryPort & AutomationRepositoryAsyncPort {
  return typeof (port as Partial<AutomationRepositoryAsyncPort>).readStateAsync === "function";
}

export class AutomationRepository implements AutomationRepositoryPort {
  private constructor(
    private readonly store: DurableStore<AutomationState>,
    private readonly adapter?: AutomationRepositoryPort
  ) {}

  static default(): AutomationRepository {
    if (defaultRepository) {
      return defaultRepository;
    }

    if (isLocalRuntime()) {
      return AutomationRepository.inMemory(bootstrapAutomationState());
    }

    return AutomationRepository.inMemory();
  }

  static useDefault(repository: AutomationRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: AutomationState = seedAutomationState()): AutomationRepository {
    return new AutomationRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: AutomationRepositoryOptions): AutomationRepository {
    const seed = isLocalRuntime() ? bootstrapAutomationState() : seedAutomationState();
    const repository = new AutomationRepository(new JsonFileStore({ filePath, seed }));
    if (isLocalRuntime()) {
      repository.store.update((state) => withLocalSeedDefaults(state));
    }
    return repository;
  }

  static prisma({ client, fallback }: PrismaAutomationRepositoryOptions): AutomationRepository {
    return new AutomationRepository(
      new InMemoryStore(seedAutomationState()),
      new PrismaAutomationRepository(client, fallback ?? AutomationRepository.inMemory())
    );
  }

  async commitProactiveDeliveryAsync(
    input: AutomationProactiveDeliveryCommitInput
  ): Promise<AutomationProactiveDeliveryCommitResult> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.commitProactiveDeliveryAsync(input);
    }

    const idempotencyRecord = normalizeProactiveDeliveryIdempotencyRecord(input.idempotencyRecord);
    const existing = this.findProactiveDeliveryIdempotencyKey(idempotencyRecord.key);
    if (existing) {
      return replayProactiveDeliveryCommit(existing, input);
    }
    const caps = this.listProactiveFrequencyCaps({
      ruleId: input.ruleId,
      tenantId: input.tenantId
    }).filter((cap) => cap.active);
    const capUpdates = prepareProactiveFrequencyCapUpdates(caps, input.evaluatedAt);
    if (!capUpdates) {
      return proactiveDeliveryCommitResult("cap_exhausted", input);
    }

    await Promise.resolve(input.conversationRepository.recordOutboundDescriptor({
      descriptor: input.descriptor,
      outbox: input.outbox
    }));
    this.saveProactiveDeliveryAttempt(input.attempt);
    this.saveProactiveDeliveryAttribution(input.attribution);
    for (const cap of capUpdates) {
      this.saveProactiveFrequencyCap(cap.next);
    }
    this.saveProactiveDeliveryIdempotencyKey(idempotencyRecord);
    return proactiveDeliveryCommitResult("queued", input);
  }

  async readStateAsync(): Promise<AutomationState> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.readStateAsync();
    }

    return this.readState();
  }

  readState(): AutomationState {
    if (this.adapter) {
      return this.adapter.readState();
    }

    return normalizeState(this.store.read());
  }

  async findPublishIdempotencyKeyAsync(key: string): Promise<AutomationPublishIdempotencyRecord | undefined> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.findPublishIdempotencyKeyAsync(key);
    }

    return this.findPublishIdempotencyKey(key);
  }

  findPublishIdempotencyKey(key: string): AutomationPublishIdempotencyRecord | undefined {
    if (this.adapter) {
      return this.adapter.findPublishIdempotencyKey(key);
    }

    return clone(this.readState().publishIdempotencyKeys.find((item) => item.key === key));
  }

  async findProactiveDeliveryIdempotencyKeyAsync(key: string): Promise<AutomationProactiveDeliveryIdempotencyRecord | undefined> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.findProactiveDeliveryIdempotencyKeyAsync(key);
    }

    return this.findProactiveDeliveryIdempotencyKey(key);
  }

  findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined {
    if (this.adapter) {
      return this.adapter.findProactiveDeliveryIdempotencyKey(key);
    }

    return clone(this.readState().proactiveDeliveryIdempotencyKeys.find((item) => item.key === key));
  }

  async savePublishIdempotencyKeyAsync(record: AutomationPublishIdempotencyRecord): Promise<AutomationPublishIdempotencyRecord> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.savePublishIdempotencyKeyAsync(record);
    }

    return this.savePublishIdempotencyKey(record);
  }

  savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord {
    if (this.adapter) {
      return this.adapter.savePublishIdempotencyKey(record);
    }

    const persisted = clone(record);
    let saved: AutomationPublishIdempotencyRecord = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.publishIdempotencyKeys.find((item) => item.key === persisted.key);
      if (existing) {
        saved = clone(existing);
        return current;
      }
      saved = persisted;

      return {
        ...current,
        publishIdempotencyKeys: [...current.publishIdempotencyKeys, persisted]
      };
    });

    return clone(saved);
  }

  async saveProactiveDeliveryIdempotencyKeyAsync(
    record: AutomationProactiveDeliveryIdempotencyRecordInput
  ): Promise<AutomationProactiveDeliveryIdempotencyRecord> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveDeliveryIdempotencyKeyAsync(record);
    }

    return this.saveProactiveDeliveryIdempotencyKey(record);
  }

  saveProactiveDeliveryIdempotencyKey(
    record: AutomationProactiveDeliveryIdempotencyRecordInput
  ): AutomationProactiveDeliveryIdempotencyRecord {
    if (this.adapter) {
      return this.adapter.saveProactiveDeliveryIdempotencyKey(record);
    }

    const persisted = normalizeProactiveDeliveryIdempotencyRecord(record);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.proactiveDeliveryIdempotencyKeys.find((item) => item.key === persisted.key);
      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        proactiveDeliveryIdempotencyKeys: [...current.proactiveDeliveryIdempotencyKeys, persisted]
      };
    });

    return clone(saved);
  }

  listBotScenarios(): MaybePromise<BotScenario[]> {
    if (this.adapter) {
      return this.adapter.listBotScenarios();
    }

    return clone(this.readState().botScenarios.map((scenario) => normalizeBotScenarioRecord(scenario)));
  }

  findBotScenario(scenarioId: string): MaybePromise<BotScenario | undefined> {
    if (this.adapter) {
      return this.adapter.findBotScenario(scenarioId);
    }

    const scenario = this.readState().botScenarios.find((item) => item.id === scenarioId);
    return scenario ? clone(normalizeBotScenarioRecord(scenario)) : undefined;
  }

  saveBotScenario(scenario: BotScenario): MaybePromise<BotScenario> {
    if (this.adapter) {
      return this.adapter.saveBotScenario(scenario);
    }

    let saved: BotScenario = normalizeBotScenarioRecord(scenario);
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.botScenarios.find((item) => item.id === saved.id);
      saved = normalizeBotScenarioRecord(scenario, existing);
      const exists = Boolean(existing);

      return {
        ...current,
        botScenarios: exists
          ? current.botScenarios.map((item) => item.id === saved.id ? saved : item)
          : [saved, ...current.botScenarios]
      };
    });

    return clone(saved);
  }

  findBotScenarioVersion(versionId: string): MaybePromise<AutomationBotScenarioVersion | undefined> {
    if (this.adapter) {
      return this.adapter.findBotScenarioVersion(versionId);
    }

    const version = this.readState().botScenarioVersions.find((item) => item.versionId === versionId);
    return version ? clone(normalizeBotScenarioVersionRecord(version)) : undefined;
  }

  listBotScenarioVersions(scenarioId: string): MaybePromise<AutomationBotScenarioVersion[]> {
    if (this.adapter) {
      return this.adapter.listBotScenarioVersions(scenarioId);
    }

    return clone(this.readState().botScenarioVersions
      .filter((version) => version.scenarioId === scenarioId)
      .map((version) => normalizeBotScenarioVersionRecord(version)));
  }

  saveBotScenarioVersion(version: AutomationBotScenarioVersion): MaybePromise<AutomationBotScenarioVersion> {
    if (this.adapter) {
      return this.adapter.saveBotScenarioVersion(version);
    }

    const persisted = normalizeBotScenarioVersionRecord(version);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.botScenarioVersions.find((item) => item.versionId === persisted.versionId);
      if (existing) {
        saved = normalizeBotScenarioVersionRecord(existing);
        return current;
      }

      return {
        ...current,
        botScenarioVersions: [...current.botScenarioVersions, persisted]
      };
    });

    return clone(saved);
  }

  findBotPublishAuditEvent(auditId: string): MaybePromise<AutomationBotPublishAuditEvent | undefined> {
    if (this.adapter) {
      return this.adapter.findBotPublishAuditEvent(auditId);
    }

    const event = this.readState().botPublishAuditEvents.find((item) => item.auditId === auditId);
    return event ? clone(normalizeBotPublishAuditEventRecord(event)) : undefined;
  }

  listBotPublishAuditEvents(scenarioId: string): MaybePromise<AutomationBotPublishAuditEvent[]> {
    if (this.adapter) {
      return this.adapter.listBotPublishAuditEvents(scenarioId);
    }

    return clone(
      this.readState()
        .botPublishAuditEvents.filter((event) => event.scenarioId === scenarioId)
        .map((event) => normalizeBotPublishAuditEventRecord(event))
    );
  }

  saveBotPublishAuditEvent(event: AutomationBotPublishAuditEvent): MaybePromise<AutomationBotPublishAuditEvent> {
    if (this.adapter) {
      return this.adapter.saveBotPublishAuditEvent(event);
    }

    const persisted = normalizeBotPublishAuditEventRecord(event);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.botPublishAuditEvents.find(
        (item) => item.auditId === persisted.auditId || item.idempotencyKey === persisted.idempotencyKey
      );
      if (existing) {
        saved = normalizeBotPublishAuditEventRecord(existing);
        return current;
      }

      return {
        ...current,
        botPublishAuditEvents: [...current.botPublishAuditEvents, persisted]
      };
    });

    return clone(saved);
  }

  async listProactiveRulesAsync(): Promise<ProactiveRule[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveRulesAsync();
    }

    return this.listProactiveRules();
  }

  listProactiveRules(): ProactiveRule[] {
    if (this.adapter) {
      return this.adapter.listProactiveRules();
    }

    return clone(this.readState().proactiveRules);
  }

  async listProactiveExecutionWindowsAsync(
    filter: AutomationProactiveExecutionWindowFilter = {}
  ): Promise<AutomationProactiveExecutionWindow[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveExecutionWindowsAsync(filter);
    }

    return this.listProactiveExecutionWindows(filter);
  }

  listProactiveExecutionWindows(
    filter: AutomationProactiveExecutionWindowFilter = {}
  ): AutomationProactiveExecutionWindow[] {
    if (this.adapter) {
      return this.adapter.listProactiveExecutionWindows(filter);
    }

    return clone(this.readState().proactiveExecutionWindows.filter((window) =>
      (!filter.ruleId || window.ruleId === filter.ruleId) &&
      (!filter.tenantId || window.tenantId === filter.tenantId)
    ));
  }

  async saveProactiveExecutionWindowAsync(window: AutomationProactiveExecutionWindowInput): Promise<AutomationProactiveExecutionWindow> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveExecutionWindowAsync(window);
    }

    return this.saveProactiveExecutionWindow(window);
  }

  saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow {
    if (this.adapter) {
      return this.adapter.saveProactiveExecutionWindow(window);
    }

    const persisted = normalizeProactiveExecutionWindow(window);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.proactiveExecutionWindows.some((item) => item.windowId === persisted.windowId);

      return {
        ...current,
        proactiveExecutionWindows: exists
          ? current.proactiveExecutionWindows.map((item) => item.windowId === persisted.windowId ? persisted : item)
          : [persisted, ...current.proactiveExecutionWindows]
      };
    });

    return clone(persisted);
  }

  async listProactiveFrequencyCapsAsync(filter: AutomationProactiveFrequencyCapFilter = {}): Promise<AutomationProactiveFrequencyCap[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveFrequencyCapsAsync(filter);
    }

    return this.listProactiveFrequencyCaps(filter);
  }

  listProactiveFrequencyCaps(filter: AutomationProactiveFrequencyCapFilter = {}): AutomationProactiveFrequencyCap[] {
    if (this.adapter) {
      return this.adapter.listProactiveFrequencyCaps(filter);
    }

    return clone(this.readState().proactiveFrequencyCaps.filter((cap) =>
      (!filter.ruleId || cap.ruleId === filter.ruleId) &&
      (!filter.tenantId || cap.tenantId === filter.tenantId)
    ));
  }

  async saveProactiveFrequencyCapAsync(cap: AutomationProactiveFrequencyCapInput): Promise<AutomationProactiveFrequencyCap> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveFrequencyCapAsync(cap);
    }

    return this.saveProactiveFrequencyCap(cap);
  }

  saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap {
    if (this.adapter) {
      return this.adapter.saveProactiveFrequencyCap(cap);
    }

    const persisted = normalizeProactiveFrequencyCap(cap);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.proactiveFrequencyCaps.some((item) => item.capId === persisted.capId);

      return {
        ...current,
        proactiveFrequencyCaps: exists
          ? current.proactiveFrequencyCaps.map((item) => item.capId === persisted.capId ? persisted : item)
          : [persisted, ...current.proactiveFrequencyCaps]
      };
    });

    return clone(persisted);
  }

  async listProactiveExperimentAssignmentsAsync(
    filter: AutomationProactiveExperimentAssignmentFilter = {}
  ): Promise<AutomationProactiveExperimentAssignment[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveExperimentAssignmentsAsync(filter);
    }

    return this.listProactiveExperimentAssignments(filter);
  }

  listProactiveExperimentAssignments(
    filter: AutomationProactiveExperimentAssignmentFilter = {}
  ): AutomationProactiveExperimentAssignment[] {
    if (this.adapter) {
      return this.adapter.listProactiveExperimentAssignments(filter);
    }

    return clone(this.readState().proactiveExperimentAssignments.filter((assignment) =>
      (!filter.ruleId || assignment.ruleId === filter.ruleId) &&
      (!filter.subjectId || assignment.subjectId === filter.subjectId) &&
      (!filter.tenantId || assignment.tenantId === filter.tenantId)
    ));
  }

  async saveProactiveExperimentAssignmentAsync(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): Promise<AutomationProactiveExperimentAssignment> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveExperimentAssignmentAsync(assignment);
    }

    return this.saveProactiveExperimentAssignment(assignment);
  }

  saveProactiveExperimentAssignment(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): AutomationProactiveExperimentAssignment {
    if (this.adapter) {
      return this.adapter.saveProactiveExperimentAssignment(assignment);
    }

    const persisted = normalizeProactiveExperimentAssignment(assignment);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.proactiveExperimentAssignments.find((item) => item.assignmentId === persisted.assignmentId);
      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        proactiveExperimentAssignments: [persisted, ...current.proactiveExperimentAssignments]
      };
    });

    return clone(saved);
  }

  async listProactiveDeliveryAttemptsAsync(
    filter: AutomationProactiveDeliveryAttemptFilter = {}
  ): Promise<AutomationProactiveDeliveryAttempt[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveDeliveryAttemptsAsync(filter);
    }

    return this.listProactiveDeliveryAttempts(filter);
  }

  listProactiveDeliveryAttempts(
    filter: AutomationProactiveDeliveryAttemptFilter = {}
  ): AutomationProactiveDeliveryAttempt[] {
    if (this.adapter) {
      return this.adapter.listProactiveDeliveryAttempts(filter);
    }

    return clone(this.readState().proactiveDeliveryAttempts.filter((attempt) =>
      (!filter.ruleId || attempt.ruleId === filter.ruleId) &&
      (!filter.subjectId || attempt.subjectId === filter.subjectId) &&
      (!filter.tenantId || attempt.tenantId === filter.tenantId)
    ));
  }

  async saveProactiveDeliveryAttemptAsync(attempt: AutomationProactiveDeliveryAttemptInput): Promise<AutomationProactiveDeliveryAttempt> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveDeliveryAttemptAsync(attempt);
    }

    return this.saveProactiveDeliveryAttempt(attempt);
  }

  saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt {
    if (this.adapter) {
      return this.adapter.saveProactiveDeliveryAttempt(attempt);
    }

    const persisted = normalizeProactiveDeliveryAttempt(attempt);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.proactiveDeliveryAttempts.find((item) => item.attemptId === persisted.attemptId);
      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        proactiveDeliveryAttempts: [persisted, ...current.proactiveDeliveryAttempts]
      };
    });

    return clone(saved);
  }

  async listProactiveDeliveryAttributionsAsync(
    filter: AutomationProactiveDeliveryAttributionFilter = {}
  ): Promise<AutomationProactiveDeliveryAttribution[]> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.listProactiveDeliveryAttributionsAsync(filter);
    }

    return this.listProactiveDeliveryAttributions(filter);
  }

  listProactiveDeliveryAttributions(
    filter: AutomationProactiveDeliveryAttributionFilter = {}
  ): AutomationProactiveDeliveryAttribution[] {
    if (this.adapter) {
      return this.adapter.listProactiveDeliveryAttributions(filter);
    }

    return clone(this.readState().proactiveDeliveryAttributions.filter((attribution) =>
      (!filter.ruleId || attribution.ruleId === filter.ruleId) &&
      (!filter.subjectId || attribution.subjectId === filter.subjectId) &&
      (!filter.tenantId || attribution.tenantId === filter.tenantId)
    ));
  }

  async saveProactiveDeliveryAttributionAsync(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): Promise<AutomationProactiveDeliveryAttribution> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveDeliveryAttributionAsync(attribution);
    }

    return this.saveProactiveDeliveryAttribution(attribution);
  }

  saveProactiveDeliveryAttribution(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): AutomationProactiveDeliveryAttribution {
    if (this.adapter) {
      return this.adapter.saveProactiveDeliveryAttribution(attribution);
    }

    const persisted = normalizeProactiveDeliveryAttribution(attribution);
    let saved = persisted;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.proactiveDeliveryAttributions.find((item) => item.attributionId === persisted.attributionId);
      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        proactiveDeliveryAttributions: [persisted, ...current.proactiveDeliveryAttributions]
      };
    });

    return clone(saved);
  }

  async saveProactiveRuleAsync(rule: ProactiveRule): Promise<ProactiveRule> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveProactiveRuleAsync(rule);
    }

    return this.saveProactiveRule(rule);
  }

  saveProactiveRule(rule: ProactiveRule): ProactiveRule {
    if (this.adapter) {
      return this.adapter.saveProactiveRule(rule);
    }

    const persisted = normalizeProactiveRuleRecord(rule);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.proactiveRules.some((item) => item.id === persisted.id);

      return {
        ...current,
        proactiveRules: exists
          ? current.proactiveRules.map((item) => item.id === persisted.id ? persisted : item)
          : [persisted, ...current.proactiveRules]
      };
    });

    return clone(persisted);
  }

  async saveBotTestRunAsync(run: AutomationBotTestRun): Promise<AutomationBotTestRun> {
    if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
      return this.adapter.saveBotTestRunAsync(run);
    }

    return this.saveBotTestRun(run);
  }

  saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun {
    if (this.adapter) {
      return this.adapter.saveBotTestRun(run);
    }

      const persisted = normalizeBotTestRunRecord(run);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.botTestRuns.some((item) => item.testRunId === persisted.testRunId);

      return {
        ...current,
        botTestRuns: exists
          ? current.botTestRuns.map((item) => item.testRunId === persisted.testRunId ? persisted : item)
          : [persisted, ...current.botTestRuns]
      };
    });

    return clone(persisted);
  }
}

class PrismaAutomationRepository implements AutomationRepositoryPort {
  constructor(private readonly client: PrismaAutomationClient, private readonly fallback: AutomationRepository) {}

  async commitProactiveDeliveryAsync(
    input: AutomationProactiveDeliveryCommitInput
  ): Promise<AutomationProactiveDeliveryCommitResult> {
    validateProactiveDeliveryCommitInput(input);
    if (!this.client.$transaction) {
      throw new Error("prisma_proactive_delivery_transaction_required");
    }

    for (let attempt = 0; attempt < PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.client.$transaction(async (transaction) => {
        const idempotencyRecord = normalizeProactiveDeliveryIdempotencyRecord(input.idempotencyRecord);
        const existing = await transaction.proactiveDeliveryIdempotencyKey.findUnique({
          where: { key: idempotencyRecord.key }
        });
        if (existing) {
          return replayProactiveDeliveryCommit(toProactiveDeliveryIdempotencyRecord(existing), input);
        }

        const capRows = await transaction.proactiveFrequencyCap.findMany({
          where: {
            active: true,
            ruleId: input.ruleId,
            tenantId: input.tenantId
          }
        });
        const caps = capRows.map(toProactiveFrequencyCap);
        const capUpdates = prepareProactiveFrequencyCapUpdates(caps, input.evaluatedAt);
        if (!capUpdates) {
          throw new ProactiveFrequencyCapExhaustedError();
        }

        await transaction.proactiveDeliveryIdempotencyKey.create({
          data: toPrismaProactiveDeliveryIdempotencyRecord(idempotencyRecord)
        });
        for (const capUpdate of capUpdates) {
          const updated = await transaction.proactiveFrequencyCap.updateMany({
            data: {
              resetAt: new Date(capUpdate.next.resetAt),
              used: capUpdate.next.used
            },
            where: {
              active: true,
              capId: capUpdate.previous.capId,
              resetAt: new Date(capUpdate.previous.resetAt),
              ruleId: input.ruleId,
              tenantId: input.tenantId,
              used: capUpdate.previous.used
            }
          });
          if (updated.count !== 1) {
            throw new ProactiveFrequencyCapConflictError();
          }
        }

        await transaction.outboxEvent.create({
          data: toPrismaAtomicOutboxEvent(input.outbox)
        });
        await transaction.conversationOutboundDescriptor.create({
          data: toPrismaAtomicConversationOutboundDescriptor(input.descriptor)
        });
        await transaction.proactiveDeliveryAttempt.create({
          data: toPrismaProactiveDeliveryAttempt(normalizeProactiveDeliveryAttempt(input.attempt))
        });
        await transaction.proactiveDeliveryAttribution.create({
          data: toPrismaProactiveDeliveryAttribution(normalizeProactiveDeliveryAttribution(input.attribution))
        });

          return proactiveDeliveryCommitResult("queued", input);
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        if (
          (error instanceof ProactiveFrequencyCapConflictError || isPrismaTransactionConflictError(error))
          && attempt + 1 < PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        if (error instanceof ProactiveFrequencyCapExhaustedError) {
          return proactiveDeliveryCommitResult("cap_exhausted", input);
        }
        if (error instanceof ProactiveFrequencyCapConflictError) {
          return proactiveDeliveryCommitResult("conflicted", input);
        }
        if (isPrismaUniqueConstraintError(error)) {
          const existing = await this.findProactiveDeliveryIdempotencyKeyAsync(input.idempotencyRecord.key);
          if (existing) {
            return replayProactiveDeliveryCommit(existing, input);
          }
        }
        throw error;
      }
    }

    throw new Error("proactive_delivery_transaction_attempts_exhausted");
  }

  async findBotPublishAuditEvent(auditId: string): Promise<AutomationBotPublishAuditEvent | undefined> {
    const row = await this.client.botPublishAuditEvent.findUnique({ where: { auditId } });
    return row ? toBotPublishAuditEvent(row) : undefined;
  }

  async findBotScenario(scenarioId: string): Promise<BotScenario | undefined> {
    const row = await this.client.botScenario.findUnique({ where: { id: scenarioId } });
    return row ? toBotScenario(row) : undefined;
  }

  async findBotScenarioVersion(versionId: string): Promise<AutomationBotScenarioVersion | undefined> {
    const row = await this.client.botScenarioVersion.findUnique({ where: { versionId } });
    return row ? toBotScenarioVersion(row) : undefined;
  }

  findPublishIdempotencyKey(key: string): AutomationPublishIdempotencyRecord | undefined {
    throw new Error("prisma_automation_async_required");
  }

  async findPublishIdempotencyKeyAsync(key: string): Promise<AutomationPublishIdempotencyRecord | undefined> {
    const row = await this.client.automationPublishIdempotencyKey.findUnique({ where: { key } });
    return row ? toAutomationPublishIdempotencyRecord(row) : undefined;
  }

  findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined {
    throw new Error("prisma_automation_async_required");
  }

  async findProactiveDeliveryIdempotencyKeyAsync(key: string): Promise<AutomationProactiveDeliveryIdempotencyRecord | undefined> {
    const row = await this.client.proactiveDeliveryIdempotencyKey.findUnique({ where: { key } });
    return row ? toProactiveDeliveryIdempotencyRecord(row) : undefined;
  }

  async listBotPublishAuditEvents(scenarioId: string): Promise<AutomationBotPublishAuditEvent[]> {
    const rows = await this.client.botPublishAuditEvent.findMany({
      orderBy: { createdAt: "asc" },
      where: { scenarioId }
    });
    return rows.map(toBotPublishAuditEvent);
  }

  async listBotScenarios(): Promise<BotScenario[]> {
    const rows = await this.client.botScenario.findMany({ orderBy: { updatedAt: "desc" } });
    return rows.map(toBotScenario);
  }

  async listBotScenarioVersions(scenarioId: string): Promise<AutomationBotScenarioVersion[]> {
    const rows = await this.client.botScenarioVersion.findMany({
      orderBy: { createdAt: "asc" },
      where: { scenarioId }
    });
    return rows.map(toBotScenarioVersion);
  }

  listProactiveRules(): ProactiveRule[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveRulesAsync(): Promise<ProactiveRule[]> {
    const rows = await this.client.proactiveRule.findMany({ orderBy: { id: "asc" } });
    return rows.map(toProactiveRule);
  }

  listProactiveExecutionWindows(
    filter: AutomationProactiveExecutionWindowFilter = {}
  ): AutomationProactiveExecutionWindow[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveExecutionWindowsAsync(
    filter: AutomationProactiveExecutionWindowFilter = {}
  ): Promise<AutomationProactiveExecutionWindow[]> {
    const rows = await this.client.proactiveExecutionWindow.findMany({ where: pruneUndefined(filter), orderBy: { windowId: "asc" } });
    return rows.map(toProactiveExecutionWindow);
  }

  listProactiveFrequencyCaps(filter: AutomationProactiveFrequencyCapFilter = {}): AutomationProactiveFrequencyCap[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveFrequencyCapsAsync(filter: AutomationProactiveFrequencyCapFilter = {}): Promise<AutomationProactiveFrequencyCap[]> {
    const rows = await this.client.proactiveFrequencyCap.findMany({ where: pruneUndefined(filter), orderBy: { capId: "asc" } });
    return rows.map(toProactiveFrequencyCap);
  }

  listProactiveExperimentAssignments(
    filter: AutomationProactiveExperimentAssignmentFilter = {}
  ): AutomationProactiveExperimentAssignment[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveExperimentAssignmentsAsync(
    filter: AutomationProactiveExperimentAssignmentFilter = {}
  ): Promise<AutomationProactiveExperimentAssignment[]> {
    const rows = await this.client.proactiveExperimentAssignment.findMany({
      where: pruneUndefined(filter),
      orderBy: { assignedAt: "asc" }
    });
    return rows.map(toProactiveExperimentAssignment);
  }

  listProactiveDeliveryAttempts(
    filter: AutomationProactiveDeliveryAttemptFilter = {}
  ): AutomationProactiveDeliveryAttempt[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveDeliveryAttemptsAsync(
    filter: AutomationProactiveDeliveryAttemptFilter = {}
  ): Promise<AutomationProactiveDeliveryAttempt[]> {
    const rows = await this.client.proactiveDeliveryAttempt.findMany({
      where: pruneUndefined(filter),
      orderBy: { attemptedAt: "asc" }
    });
    return rows.map(toProactiveDeliveryAttempt);
  }

  listProactiveDeliveryAttributions(
    filter: AutomationProactiveDeliveryAttributionFilter = {}
  ): AutomationProactiveDeliveryAttribution[] {
    throw new Error("prisma_automation_async_required");
  }

  async listProactiveDeliveryAttributionsAsync(
    filter: AutomationProactiveDeliveryAttributionFilter = {}
  ): Promise<AutomationProactiveDeliveryAttribution[]> {
    const rows = await this.client.proactiveDeliveryAttribution.findMany({
      where: pruneUndefined(filter),
      orderBy: { assignedAt: "asc" }
    });
    return rows.map(toProactiveDeliveryAttribution);
  }

  readState(): AutomationState {
    throw new Error("prisma_automation_async_required");
  }

  async readStateAsync(): Promise<AutomationState> {
    const [
      botPublishAuditEvents,
      botScenarios,
      botScenarioVersions,
      botTestRuns,
      proactiveDeliveryAttributions,
      proactiveDeliveryAttempts,
      proactiveDeliveryIdempotencyKeys,
      proactiveExecutionWindows,
      proactiveExperimentAssignments,
      proactiveFrequencyCaps,
      proactiveRules,
      publishIdempotencyKeys
    ] = await Promise.all([
      this.client.botPublishAuditEvent.findMany({ orderBy: { createdAt: "asc" }, where: {} as never }),
      this.client.botScenario.findMany({ orderBy: { updatedAt: "desc" } }),
      this.client.botScenarioVersion.findMany({ orderBy: { createdAt: "asc" }, where: {} as never }),
      this.client.automationBotTestRun.findMany({ orderBy: { testRunId: "asc" } }),
      this.client.proactiveDeliveryAttribution.findMany({ orderBy: { assignedAt: "asc" } }),
      this.client.proactiveDeliveryAttempt.findMany({ orderBy: { attemptedAt: "asc" } }),
      this.client.proactiveDeliveryIdempotencyKey.findMany({ orderBy: { key: "asc" } }),
      this.client.proactiveExecutionWindow.findMany({ orderBy: { windowId: "asc" } }),
      this.client.proactiveExperimentAssignment.findMany({ orderBy: { assignedAt: "asc" } }),
      this.client.proactiveFrequencyCap.findMany({ orderBy: { capId: "asc" } }),
      this.client.proactiveRule.findMany({ orderBy: { id: "asc" } }),
      this.client.automationPublishIdempotencyKey.findMany({ orderBy: { key: "asc" } })
    ]);

    return {
      ...seedAutomationState(),
      botPublishAuditEvents: botPublishAuditEvents.map(toBotPublishAuditEvent),
      botScenarios: botScenarios.map(toBotScenario),
      botScenarioVersions: botScenarioVersions.map(toBotScenarioVersion),
      botTestRuns: botTestRuns.map(toAutomationBotTestRun),
      proactiveDeliveryAttributions: proactiveDeliveryAttributions.map(toProactiveDeliveryAttribution),
      proactiveDeliveryAttempts: proactiveDeliveryAttempts.map(toProactiveDeliveryAttempt),
      proactiveDeliveryIdempotencyKeys: proactiveDeliveryIdempotencyKeys.map(toProactiveDeliveryIdempotencyRecord),
      proactiveExecutionWindows: proactiveExecutionWindows.map(toProactiveExecutionWindow),
      proactiveExperimentAssignments: proactiveExperimentAssignments.map(toProactiveExperimentAssignment),
      proactiveFrequencyCaps: proactiveFrequencyCaps.map(toProactiveFrequencyCap),
      proactiveRules: proactiveRules.map(toProactiveRule),
      publishIdempotencyKeys: publishIdempotencyKeys.map(toAutomationPublishIdempotencyRecord)
    };
  }

  async saveBotPublishAuditEvent(event: AutomationBotPublishAuditEvent): Promise<AutomationBotPublishAuditEvent> {
    const persisted = normalizeBotPublishAuditEventRecord(event);
    const existingByAuditId = await this.client.botPublishAuditEvent.findUnique({
      where: { auditId: persisted.auditId }
    });
    if (existingByAuditId) {
      const existing = toBotPublishAuditEvent(existingByAuditId);
      return existing;
    }

    const existingByIdempotencyKey = await this.client.botPublishAuditEvent.findUnique({
      where: { idempotencyKey: persisted.idempotencyKey }
    });
    if (existingByIdempotencyKey) {
      const existing = toBotPublishAuditEvent(existingByIdempotencyKey);
      return existing;
    }

    const row = await this.client.botPublishAuditEvent.create({
      data: toPrismaBotPublishAuditEventCreateInput(persisted)
    });
    const saved = toBotPublishAuditEvent(row);
    return saved;
  }

  async saveBotScenario(scenario: BotScenario): Promise<BotScenario> {
    const existingRow = await this.client.botScenario.findUnique({ where: { id: scenario.id } });
    const existing = existingRow ? toBotScenario(existingRow) : undefined;
    const persisted = normalizeBotScenarioRecord(scenario, existing);
    const row = await this.client.botScenario.upsert({
      create: toPrismaBotScenarioCreateInput(persisted),
      update: toPrismaBotScenarioUpdateInput(persisted),
      where: { id: persisted.id }
    });
    const saved = toBotScenario(row);

    return saved;
  }

  async saveBotScenarioVersion(version: AutomationBotScenarioVersion): Promise<AutomationBotScenarioVersion> {
    const persisted = normalizeBotScenarioVersionRecord(version);
    const existing = await this.findBotScenarioVersion(persisted.versionId);
    if (existing) {
      return existing;
    }

    const row = await this.client.botScenarioVersion.create({
      data: toPrismaBotScenarioVersionCreateInput(persisted)
    });
    const saved = toBotScenarioVersion(row);
    return saved;
  }

  saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun {
    throw new Error("prisma_automation_async_required");
  }

  async saveBotTestRunAsync(run: AutomationBotTestRun): Promise<AutomationBotTestRun> {
    const persisted = normalizeBotTestRunRecord(run);
    const row = await this.client.automationBotTestRun.upsert({
      create: toPrismaAutomationBotTestRun(persisted),
      update: toPrismaAutomationBotTestRun(persisted),
      where: { testRunId: persisted.testRunId }
    });
    return toAutomationBotTestRun(row);
  }

  saveProactiveRule(rule: ProactiveRule): ProactiveRule {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveRuleAsync(rule: ProactiveRule): Promise<ProactiveRule> {
    const persisted = clone(rule);
    const row = await this.client.proactiveRule.upsert({
      create: toPrismaProactiveRule(persisted),
      update: toPrismaProactiveRule(persisted),
      where: { id: persisted.id }
    });
    return toProactiveRule(row);
  }

  saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveExecutionWindowAsync(window: AutomationProactiveExecutionWindowInput): Promise<AutomationProactiveExecutionWindow> {
    const persisted = normalizeProactiveExecutionWindow(window);
    const row = await this.client.proactiveExecutionWindow.upsert({
      create: toPrismaProactiveExecutionWindow(persisted),
      update: toPrismaProactiveExecutionWindow(persisted),
      where: { windowId: persisted.windowId }
    });
    return toProactiveExecutionWindow(row);
  }

  saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveFrequencyCapAsync(cap: AutomationProactiveFrequencyCapInput): Promise<AutomationProactiveFrequencyCap> {
    const persisted = normalizeProactiveFrequencyCap(cap);
    const row = await this.client.proactiveFrequencyCap.upsert({
      create: toPrismaProactiveFrequencyCap(persisted),
      update: toPrismaProactiveFrequencyCap(persisted),
      where: { capId: persisted.capId }
    });
    return toProactiveFrequencyCap(row);
  }

  saveProactiveExperimentAssignment(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): AutomationProactiveExperimentAssignment {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveExperimentAssignmentAsync(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): Promise<AutomationProactiveExperimentAssignment> {
    const persisted = normalizeProactiveExperimentAssignment(assignment);
    const existing = await this.client.proactiveExperimentAssignment.findUnique({
      where: { assignmentId: persisted.assignmentId }
    });
    if (existing) {
      return toProactiveExperimentAssignment(existing);
    }
    try {
      const row = await this.client.proactiveExperimentAssignment.create({
        data: toPrismaProactiveExperimentAssignment(persisted)
      });
      return toProactiveExperimentAssignment(row);
    } catch (error) {
      if (!isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const replay = await this.client.proactiveExperimentAssignment.findUnique({
        where: { assignmentId: persisted.assignmentId }
      });
      if (!replay) {
        throw error;
      }
      return toProactiveExperimentAssignment(replay);
    }
  }

  saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveDeliveryAttemptAsync(attempt: AutomationProactiveDeliveryAttemptInput): Promise<AutomationProactiveDeliveryAttempt> {
    const persisted = normalizeProactiveDeliveryAttempt(attempt);
    const existing = await this.client.proactiveDeliveryAttempt.findUnique({ where: { attemptId: persisted.attemptId } });
    if (existing) {
      return toProactiveDeliveryAttempt(existing);
    }
    const row = await this.client.proactiveDeliveryAttempt.create({ data: toPrismaProactiveDeliveryAttempt(persisted) });
    return toProactiveDeliveryAttempt(row);
  }

  saveProactiveDeliveryAttribution(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): AutomationProactiveDeliveryAttribution {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveDeliveryAttributionAsync(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): Promise<AutomationProactiveDeliveryAttribution> {
    const persisted = normalizeProactiveDeliveryAttribution(attribution);
    const existing = await this.client.proactiveDeliveryAttribution.findUnique({
      where: { attributionId: persisted.attributionId }
    });
    if (existing) {
      return toProactiveDeliveryAttribution(existing);
    }
    const row = await this.client.proactiveDeliveryAttribution.create({
      data: toPrismaProactiveDeliveryAttribution(persisted)
    });
    return toProactiveDeliveryAttribution(row);
  }

  saveProactiveDeliveryIdempotencyKey(
    record: AutomationProactiveDeliveryIdempotencyRecordInput
  ): AutomationProactiveDeliveryIdempotencyRecord {
    throw new Error("prisma_automation_async_required");
  }

  async saveProactiveDeliveryIdempotencyKeyAsync(
    record: AutomationProactiveDeliveryIdempotencyRecordInput
  ): Promise<AutomationProactiveDeliveryIdempotencyRecord> {
    const persisted = normalizeProactiveDeliveryIdempotencyRecord(record);
    const existing = await this.client.proactiveDeliveryIdempotencyKey.findUnique({ where: { key: persisted.key } });
    if (existing) {
      return toProactiveDeliveryIdempotencyRecord(existing);
    }
    const row = await this.client.proactiveDeliveryIdempotencyKey.create({
      data: toPrismaProactiveDeliveryIdempotencyRecord(persisted)
    });
    return toProactiveDeliveryIdempotencyRecord(row);
  }

  savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord {
    throw new Error("prisma_automation_async_required");
  }

  async savePublishIdempotencyKeyAsync(record: AutomationPublishIdempotencyRecord): Promise<AutomationPublishIdempotencyRecord> {
    const persisted: AutomationPublishIdempotencyRecord = {
      ...record,
      result: clone(record.result)
    };
    const existing = await this.client.automationPublishIdempotencyKey.findUnique({ where: { key: persisted.key } });
    if (existing) {
      return toAutomationPublishIdempotencyRecord(existing);
    }
    const row = await this.client.automationPublishIdempotencyKey.create({
      data: toPrismaAutomationPublishIdempotencyRecord(persisted)
    });
    return toAutomationPublishIdempotencyRecord(row);
  }
}

function seedAutomationState(): AutomationState {
  return {
    botPublishAuditEvents: [],
    botScenarios: [],
    botScenarioVersions: [],
    botTestRuns: [],
    proactiveDeliveryAttributions: [],
    proactiveDeliveryAttempts: [],
    proactiveDeliveryIdempotencyKeys: [],
    proactiveExecutionWindows: [],
    proactiveExperimentAssignments: [],
    proactiveFrequencyCaps: [],
    proactiveRules: [],
    publishIdempotencyKeys: [],
    activeVisitors: [],
    rescueChats: [],
    workspaceAuditEvents: [],
    workspaceRuntimeMetrics: []
  };
}

function normalizeState(state: Partial<AutomationState>): AutomationState {
  return {
    botPublishAuditEvents: (state.botPublishAuditEvents ?? []).map((event) =>
      normalizeBotPublishAuditEventRecord(event)
    ),
    botScenarios: (state.botScenarios ?? []).map((scenario) => normalizeBotScenarioRecord(scenario)),
    botScenarioVersions: (state.botScenarioVersions ?? []).map((version) => normalizeBotScenarioVersionRecord(version)),
    botTestRuns: (state.botTestRuns ?? []).map((run) => normalizeBotTestRunRecord(run)),
    proactiveDeliveryAttributions: (state.proactiveDeliveryAttributions ?? []).map((attribution) =>
      normalizeProactiveDeliveryAttribution(attribution)
    ),
    proactiveDeliveryAttempts: (state.proactiveDeliveryAttempts ?? []).map((attempt) => normalizeProactiveDeliveryAttempt(attempt)),
    proactiveDeliveryIdempotencyKeys: (state.proactiveDeliveryIdempotencyKeys ?? []).map((record) =>
      normalizeProactiveDeliveryIdempotencyRecord(record)
    ),
    proactiveExecutionWindows: (state.proactiveExecutionWindows ?? []).map((window) => normalizeProactiveExecutionWindow(window)),
    proactiveExperimentAssignments: (state.proactiveExperimentAssignments ?? []).map((assignment) =>
      normalizeProactiveExperimentAssignment(assignment)
    ),
    proactiveFrequencyCaps: (state.proactiveFrequencyCaps ?? []).map((cap) => normalizeProactiveFrequencyCap(cap)),
    proactiveRules: (state.proactiveRules ?? []).map(normalizeProactiveRuleRecord),
    publishIdempotencyKeys: state.publishIdempotencyKeys ?? [],
    activeVisitors: state.activeVisitors ?? [],
    rescueChats: state.rescueChats ?? [],
    workspaceAuditEvents: state.workspaceAuditEvents ?? [],
    workspaceRuntimeMetrics: state.workspaceRuntimeMetrics ?? []
  };
}

function normalizeProactiveRuleRecord(rule: ProactiveRule): ProactiveRule {
  return {
    ...clone(rule),
    channels: clone(rule.channels),
    tenantId: String(rule.tenantId ?? "tenant-volga").trim() || "tenant-volga"
  };
}

function withLocalSeedDefaults(state: Partial<AutomationState>): AutomationState {
  const normalized = normalizeState(state);
  const seed = bootstrapAutomationState();
  return {
    ...normalized,
    botScenarios: withLocalDemoTenantScenarios(normalized.botScenarios, seed.botScenarios),
    proactiveRules: withLocalDemoTenantRules(normalized.proactiveRules, seed.proactiveRules),
    workspaceAuditEvents: normalized.workspaceAuditEvents.length ? normalized.workspaceAuditEvents : seed.workspaceAuditEvents,
    workspaceRuntimeMetrics: normalized.workspaceRuntimeMetrics.length ? normalized.workspaceRuntimeMetrics : seed.workspaceRuntimeMetrics
  };
}

function withLocalDemoTenantRules(existing: ProactiveRule[], seedRules: ProactiveRule[]): ProactiveRule[] {
  const rules = existing.length ? [...existing] : seedRules.map(normalizeProactiveRuleRecord);
  for (const tenantId of ["tenant-demo", "tenant-volga"]) {
    if (rules.some((rule) => rule.tenantId === tenantId)) {
      continue;
    }
    rules.push(...seedRules.map((rule) => normalizeProactiveRuleRecord({
      ...rule,
      id: `${rule.id}-${tenantId.replace(/^tenant-/, "")}`,
      tenantId
    })));
  }
  return rules;
}

function withLocalDemoTenantScenarios(existing: BotScenario[], seedScenarios: BotScenario[]): BotScenario[] {
  const scenarios = existing.length ? [...existing] : seedScenarios.map((scenario) => normalizeBotScenarioRecord(scenario));
  for (const tenantId of ["tenant-demo", "tenant-volga"]) {
    if (scenarios.some((scenario) => scenario.tenantId === tenantId)) {
      continue;
    }

    scenarios.push(...seedScenarios.map((scenario) => cloneScenarioForTenant(scenario, tenantId)));
  }
  return scenarios;
}

function cloneScenarioForTenant(scenario: BotScenario, tenantId: string): BotScenario {
  const suffix = tenantId === "tenant-demo" ? "" : `-${tenantId.replace(/^tenant-/, "")}`;
  const nodeIds = new Map(scenario.flowNodes.map((node) => [node.id, `${node.id}${suffix}`]));
  return normalizeBotScenarioRecord({
    ...scenario,
    flowEdges: scenario.flowEdges.map((edge) => ({
      ...edge,
      from: nodeIds.get(edge.from) ?? `${edge.from}${suffix}`,
      to: nodeIds.get(edge.to) ?? `${edge.to}${suffix}`
    })),
    flowNodes: scenario.flowNodes.map((node) => ({
      ...node,
      id: nodeIds.get(node.id) ?? `${node.id}${suffix}`
    })),
    id: `${scenario.id}${suffix}`,
    tenantId
  });
}

function normalizeBotScenarioRecord(scenario: BotScenario, existing?: BotScenario): BotScenario {
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt ?? scenario.createdAt ?? now;

  return {
    ...scenario,
    createdAt,
    tenantId: existing?.tenantId ?? scenario.tenantId ?? "tenant-demo",
    updatedAt: existing ? now : scenario.updatedAt ?? now
  };
}

function normalizeBotScenarioVersionRecord(version: AutomationBotScenarioVersion): AutomationBotScenarioVersion {
  return {
    ...version,
    tenantId: version.tenantId ?? "tenant-demo"
  };
}

function normalizeBotPublishAuditEventRecord(event: AutomationBotPublishAuditEvent): AutomationBotPublishAuditEvent {
  return {
    ...event,
    immutable: true,
    tenantId: event.tenantId ?? "tenant-demo"
  };
}

function normalizeBotTestRunRecord(run: AutomationBotTestRun): AutomationBotTestRun {
  return {
    ...run,
    tenantId: run.tenantId ?? "tenant-demo"
  };
}

function normalizeProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow {
  return {
    ...window,
    daysOfWeek: [...window.daysOfWeek],
    tenantId: window.tenantId || "tenant-demo"
  };
}

function normalizeProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap {
  return {
    ...cap,
    tenantId: cap.tenantId || "tenant-demo"
  };
}

function normalizeProactiveExperimentAssignment(
  assignment: AutomationProactiveExperimentAssignmentInput
): AutomationProactiveExperimentAssignment {
  return {
    ...assignment,
    tenantId: assignment.tenantId || "tenant-demo"
  };
}

function normalizeProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt {
  return {
    ...attempt,
    tenantId: attempt.tenantId || "tenant-demo"
  };
}

function normalizeProactiveDeliveryIdempotencyRecord(
  record: AutomationProactiveDeliveryIdempotencyRecordInput
): AutomationProactiveDeliveryIdempotencyRecord {
  return {
    ...record,
    result: clone(record.result),
    tenantId: record.tenantId || "tenant-demo"
  };
}

function normalizeProactiveDeliveryAttribution(
  attribution: AutomationProactiveDeliveryAttributionInput
): AutomationProactiveDeliveryAttribution {
  return {
    ...attribution,
    tenantId: attribution.tenantId || "tenant-demo"
  };
}

function toBotScenario(row: PrismaBotScenarioRow): BotScenario {
  return {
    channels: clone(row.channels),
    createdAt: toIsoString(row.createdAt),
    flowEdges: clone(row.flowEdges) as BotScenario["flowEdges"],
    flowNodes: clone(row.flowNodes) as BotScenario["flowNodes"],
    id: row.id,
    name: row.name,
    schemaVersion: row.schemaVersion as BotScenario["schemaVersion"],
    status: row.status,
    tenantId: row.tenantId,
    updatedAt: toIsoString(row.updatedAt)
  };
}

function toPrismaBotScenarioCreateInput(scenario: BotScenario): PrismaBotScenarioCreateInput {
  return {
    channels: clone(scenario.channels),
    createdAt: new Date(scenario.createdAt ?? new Date().toISOString()),
    flowEdges: clone(scenario.flowEdges),
    flowNodes: clone(scenario.flowNodes),
    id: scenario.id,
    name: scenario.name,
    schemaVersion: scenario.schemaVersion,
    status: scenario.status,
    tenantId: scenario.tenantId ?? "tenant-demo",
    updatedAt: new Date(scenario.updatedAt ?? new Date().toISOString())
  };
}

function toPrismaBotScenarioUpdateInput(scenario: BotScenario): PrismaBotScenarioUpdateInput {
  return {
    channels: clone(scenario.channels),
    flowEdges: clone(scenario.flowEdges),
    flowNodes: clone(scenario.flowNodes),
    name: scenario.name,
    schemaVersion: scenario.schemaVersion,
    status: scenario.status,
    tenantId: scenario.tenantId ?? "tenant-demo"
  };
}

function toBotScenarioVersion(row: PrismaBotScenarioVersionRow): AutomationBotScenarioVersion {
  return {
    createdAt: toIsoString(row.createdAt),
    flowEdges: clone(row.flowEdges) as AutomationBotScenarioVersion["flowEdges"],
    flowNodes: clone(row.flowNodes) as AutomationBotScenarioVersion["flowNodes"],
    scenarioId: row.scenarioId,
    status: row.status,
    tenantId: row.tenantId,
    versionId: row.versionId
  };
}

function toPrismaBotScenarioVersionCreateInput(
  version: AutomationBotScenarioVersion
): PrismaBotScenarioVersionCreateInput {
  return {
    createdAt: new Date(version.createdAt),
    flowEdges: clone(version.flowEdges),
    flowNodes: clone(version.flowNodes),
    scenarioId: version.scenarioId,
    status: version.status,
    tenantId: version.tenantId ?? "tenant-demo",
    versionId: version.versionId
  };
}

function toBotPublishAuditEvent(row: PrismaBotPublishAuditEventRow): AutomationBotPublishAuditEvent {
  return normalizeBotPublishAuditEventRecord({
    action: row.action,
    actor: row.actor,
    auditId: row.auditId,
    createdAt: toIsoString(row.createdAt),
    idempotencyKey: row.idempotencyKey,
    immutable: true,
    runtimeVersion: row.runtimeVersion,
    scenarioId: row.scenarioId,
    tenantId: row.tenantId,
    versionId: row.versionId
  });
}

function toPrismaBotPublishAuditEventCreateInput(
  event: AutomationBotPublishAuditEvent
): PrismaBotPublishAuditEventCreateInput {
  return {
    action: event.action,
    actor: event.actor,
    auditId: event.auditId,
    createdAt: new Date(event.createdAt),
    idempotencyKey: event.idempotencyKey,
    immutable: true,
    runtimeVersion: event.runtimeVersion,
    scenarioId: event.scenarioId,
    tenantId: event.tenantId ?? "tenant-demo",
    versionId: event.versionId
  };
}

function toAutomationPublishIdempotencyRecord(
  row: PrismaAutomationPublishIdempotencyKeyRow
): AutomationPublishIdempotencyRecord {
  return {
    fingerprint: row.fingerprint,
    key: row.key,
    result: clone(row.result) as Record<string, unknown>
  };
}

function toPrismaAutomationPublishIdempotencyRecord(
  record: AutomationPublishIdempotencyRecord
): PrismaAutomationPublishIdempotencyKeyRow {
  return {
    fingerprint: record.fingerprint,
    key: record.key,
    result: clone(record.result)
  };
}

function toAutomationBotTestRun(row: PrismaAutomationBotTestRunRow): AutomationBotTestRun {
  return normalizeBotTestRunRecord({
    auditId: row.auditId,
    cases: clone(row.cases) as Array<Record<string, unknown>>,
    queue: row.queue,
    scenarioId: row.scenarioId,
    status: row.status,
    tenantId: row.tenantId ?? undefined,
    testRunId: row.testRunId
  });
}

function toPrismaAutomationBotTestRun(run: AutomationBotTestRun): PrismaAutomationBotTestRunRow {
  return {
    auditId: run.auditId,
    cases: clone(run.cases),
    queue: run.queue,
    scenarioId: run.scenarioId,
    status: run.status,
    tenantId: run.tenantId ?? "tenant-demo",
    testRunId: run.testRunId
  };
}

function toProactiveRule(row: PrismaProactiveRuleRow): ProactiveRule {
  return {
    activeVariant: row.activeVariant ?? undefined,
    channels: clone(row.channels),
    cooldown: row.cooldown ?? undefined,
    id: row.id,
    segment: row.segment ?? undefined,
    status: row.status ?? undefined,
    tenantId: row.tenantId
  };
}

function toPrismaProactiveRule(rule: ProactiveRule): PrismaProactiveRuleRow {
  return {
    activeVariant: rule.activeVariant ?? null,
    channels: clone(rule.channels),
    cooldown: rule.cooldown ?? null,
    id: rule.id,
    segment: rule.segment ?? null,
    status: rule.status ?? null,
    tenantId: String(rule.tenantId ?? "tenant-volga").trim() || "tenant-volga"
  };
}

function toProactiveExecutionWindow(row: PrismaProactiveExecutionWindowRow): AutomationProactiveExecutionWindow {
  return normalizeProactiveExecutionWindow({
    active: row.active,
    daysOfWeek: clone(row.daysOfWeek),
    endsAt: row.endsAt,
    ruleId: row.ruleId,
    startsAt: row.startsAt,
    tenantId: row.tenantId,
    timezone: row.timezone,
    windowId: row.windowId
  });
}

function toPrismaProactiveExecutionWindow(
  window: AutomationProactiveExecutionWindow
): PrismaProactiveExecutionWindowRow {
  return {
    active: window.active,
    daysOfWeek: clone(window.daysOfWeek),
    endsAt: window.endsAt,
    ruleId: window.ruleId,
    startsAt: window.startsAt,
    tenantId: window.tenantId,
    timezone: window.timezone,
    windowId: window.windowId
  };
}

function toProactiveFrequencyCap(row: PrismaProactiveFrequencyCapRow): AutomationProactiveFrequencyCap {
  return normalizeProactiveFrequencyCap({
    active: row.active,
    capId: row.capId,
    limit: row.limit,
    period: row.period as AutomationProactiveFrequencyCap["period"],
    resetAt: toIsoString(row.resetAt),
    ruleId: row.ruleId,
    tenantId: row.tenantId,
    used: row.used
  });
}

function toPrismaProactiveFrequencyCap(cap: AutomationProactiveFrequencyCap): PrismaProactiveFrequencyCapRow {
  return {
    active: cap.active,
    capId: cap.capId,
    limit: cap.limit,
    period: cap.period,
    resetAt: new Date(cap.resetAt),
    ruleId: cap.ruleId,
    tenantId: cap.tenantId,
    used: cap.used
  };
}

function toProactiveExperimentAssignment(
  row: PrismaProactiveExperimentAssignmentRow
): AutomationProactiveExperimentAssignment {
  return normalizeProactiveExperimentAssignment({
    assignedAt: toIsoString(row.assignedAt),
    assignmentId: row.assignmentId,
    experimentId: row.experimentId,
    ruleId: row.ruleId,
    subjectId: row.subjectId,
    tenantId: row.tenantId,
    variant: row.variant
  });
}

function toPrismaProactiveExperimentAssignment(
  assignment: AutomationProactiveExperimentAssignment
): PrismaProactiveExperimentAssignmentRow {
  return {
    assignedAt: new Date(assignment.assignedAt),
    assignmentId: assignment.assignmentId,
    experimentId: assignment.experimentId,
    ruleId: assignment.ruleId,
    subjectId: assignment.subjectId,
    tenantId: assignment.tenantId,
    variant: assignment.variant
  };
}

function toProactiveDeliveryAttempt(row: PrismaProactiveDeliveryAttemptRow): AutomationProactiveDeliveryAttempt {
  return normalizeProactiveDeliveryAttempt({
    attemptedAt: toIsoString(row.attemptedAt),
    attemptId: row.attemptId,
    channel: row.channel,
    descriptorId: row.descriptorId,
    ruleId: row.ruleId,
    status: row.status,
    subjectId: row.subjectId,
    tenantId: row.tenantId,
    traceId: row.traceId
  });
}

function toPrismaProactiveDeliveryAttempt(
  attempt: AutomationProactiveDeliveryAttempt
): PrismaProactiveDeliveryAttemptRow {
  return {
    attemptedAt: new Date(attempt.attemptedAt),
    attemptId: attempt.attemptId,
    channel: attempt.channel,
    descriptorId: attempt.descriptorId,
    ruleId: attempt.ruleId,
    status: attempt.status,
    subjectId: attempt.subjectId,
    tenantId: attempt.tenantId,
    traceId: attempt.traceId
  };
}

function toProactiveDeliveryIdempotencyRecord(
  row: PrismaProactiveDeliveryIdempotencyKeyRow
): AutomationProactiveDeliveryIdempotencyRecord {
  return normalizeProactiveDeliveryIdempotencyRecord({
    fingerprint: row.fingerprint,
    key: row.key,
    result: clone(row.result) as Record<string, unknown>,
    ruleId: row.ruleId,
    subjectId: row.subjectId,
    tenantId: row.tenantId
  });
}

function toPrismaProactiveDeliveryIdempotencyRecord(
  record: AutomationProactiveDeliveryIdempotencyRecord
): PrismaProactiveDeliveryIdempotencyKeyRow {
  return {
    fingerprint: record.fingerprint,
    key: record.key,
    result: clone(record.result),
    ruleId: record.ruleId,
    subjectId: record.subjectId,
    tenantId: record.tenantId
  };
}

function toProactiveDeliveryAttribution(
  row: PrismaProactiveDeliveryAttributionRow
): AutomationProactiveDeliveryAttribution {
  return normalizeProactiveDeliveryAttribution({
    assignedAt: toIsoString(row.assignedAt),
    attributionId: row.attributionId,
    descriptorId: row.descriptorId,
    experimentId: row.experimentId,
    ruleId: row.ruleId,
    subjectId: row.subjectId,
    tenantId: row.tenantId,
    variant: row.variant
  });
}

function toPrismaProactiveDeliveryAttribution(
  attribution: AutomationProactiveDeliveryAttribution
): PrismaProactiveDeliveryAttributionRow {
  return {
    assignedAt: new Date(attribution.assignedAt),
    attributionId: attribution.attributionId,
    descriptorId: attribution.descriptorId,
    experimentId: attribution.experimentId,
    ruleId: attribution.ruleId,
    subjectId: attribution.subjectId,
    tenantId: attribution.tenantId,
    variant: attribution.variant
  };
}

interface ProactiveFrequencyCapUpdate {
  next: AutomationProactiveFrequencyCap;
  previous: AutomationProactiveFrequencyCap;
}

class ProactiveFrequencyCapExhaustedError extends Error {
  constructor() {
    super("proactive_frequency_cap_exhausted");
  }
}

const PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS = 3;

class ProactiveFrequencyCapConflictError extends Error {
  constructor() {
    super("proactive_frequency_cap_conflict");
  }
}

function prepareProactiveFrequencyCapUpdates(
  caps: AutomationProactiveFrequencyCap[],
  evaluatedAt: string
): ProactiveFrequencyCapUpdate[] | null {
  const evaluationTime = Date.parse(evaluatedAt);
  if (!Number.isFinite(evaluationTime)) {
    throw new Error("proactive_delivery_evaluated_at_invalid");
  }

  const updates: ProactiveFrequencyCapUpdate[] = [];
  for (const cap of caps) {
    const resetTime = Date.parse(cap.resetAt);
    if (!Number.isFinite(resetTime)) {
      throw new Error("proactive_frequency_cap_reset_invalid");
    }
    if (resetTime > evaluationTime && cap.used >= cap.limit) {
      return null;
    }
    const resetReached = resetTime <= evaluationTime;
    updates.push({
      previous: clone(cap),
      next: {
        ...clone(cap),
        resetAt: resetReached
          ? rollProactiveFrequencyCapResetForward(cap.resetAt, cap.period, evaluationTime)
          : cap.resetAt,
        used: (resetReached ? 0 : cap.used) + 1
      }
    });
  }
  return updates;
}

function rollProactiveFrequencyCapResetForward(
  resetAt: string,
  period: AutomationProactiveFrequencyCap["period"],
  evaluationTime: number
): string {
  const nextReset = new Date(resetAt);
  while (nextReset.getTime() <= evaluationTime) {
    if (period === "hour") {
      nextReset.setUTCHours(nextReset.getUTCHours() + 1);
    } else if (period === "week") {
      nextReset.setUTCDate(nextReset.getUTCDate() + 7);
    } else {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }
  }
  return nextReset.toISOString();
}

function replayProactiveDeliveryCommit(
  existing: AutomationProactiveDeliveryIdempotencyRecord,
  input: AutomationProactiveDeliveryCommitInput
): AutomationProactiveDeliveryCommitResult {
  return {
    descriptorId: String(existing.result.descriptorId ?? input.descriptor.id),
    outcome: existing.fingerprint === input.idempotencyRecord.fingerprint ? "duplicate" : "conflicted",
    outboxEventId: String(existing.result.outboxEventId ?? input.outbox.id)
  };
}

function proactiveDeliveryCommitResult(
  outcome: AutomationProactiveDeliveryCommitResult["outcome"],
  input: AutomationProactiveDeliveryCommitInput
): AutomationProactiveDeliveryCommitResult {
  return {
    descriptorId: input.descriptor.id,
    outcome,
    outboxEventId: input.outbox.id
  };
}

function validateProactiveDeliveryCommitInput(input: AutomationProactiveDeliveryCommitInput): void {
  const descriptorKey = input.descriptor.idempotencyKey;
  if (!descriptorKey || descriptorKey !== input.idempotencyRecord.key) {
    throw new Error("proactive_delivery_idempotency_key_mismatch");
  }
  if (input.descriptor.requestFingerprint !== input.idempotencyRecord.fingerprint) {
    throw new Error("proactive_delivery_fingerprint_mismatch");
  }
  if (input.descriptor.tenantId !== input.tenantId || input.idempotencyRecord.tenantId !== input.tenantId) {
    throw new Error("proactive_delivery_tenant_mismatch");
  }
  if (input.idempotencyRecord.ruleId !== input.ruleId) {
    throw new Error("proactive_delivery_rule_mismatch");
  }
}

function toPrismaAtomicConversationOutboundDescriptor(
  descriptor: ConversationOutboundDescriptor
): PrismaAtomicConversationOutboundDescriptorRow {
  return {
    auditId: descriptor.auditId,
    channel: descriptor.channel,
    conversationId: descriptor.conversationId,
    createdAt: new Date(descriptor.createdAt),
    deliveryState: descriptor.deliveryState,
    id: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey,
    kind: descriptor.kind,
    messageId: descriptor.messageId,
    outboxEventId: descriptor.outboxEventId,
    payload: clone(descriptor.payload),
    requestFingerprint: descriptor.requestFingerprint,
    retryable: descriptor.retryable,
    status: descriptor.status,
    tenantId: descriptor.tenantId,
    traceId: descriptor.traceId
  };
}

function toPrismaAtomicOutboxEvent(outbox: OutboxEvent): PrismaAtomicOutboxEventRow {
  return {
    aggregateId: outbox.aggregateId,
    aggregateType: outbox.aggregateType,
    id: outbox.id,
    occurredAt: new Date(outbox.occurredAt),
    payload: clone(outbox.payload),
    queue: outbox.queue,
    status: outbox.status,
    traceId: outbox.traceId,
    type: outbox.type
  };
}

function isPrismaUniqueConstraintError(error: unknown): error is Error & { code: "P2002" } {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function isPrismaTransactionConflictError(error: unknown): error is Error & { code: "P2034" } {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}

function pruneUndefined<T extends object>(input: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
