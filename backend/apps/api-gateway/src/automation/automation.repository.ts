import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { BotScenario, ProactiveRule } from "./automation.fixtures.js";

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
  where: { scenarioId: string };
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
  where: { scenarioId: string };
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

let defaultRepository: AutomationRepository | null = null;

export class AutomationRepository implements AutomationRepositoryPort {
  private constructor(
    private readonly store: DurableStore<AutomationState>,
    private readonly adapter?: AutomationRepositoryPort
  ) {}

  static default(): AutomationRepository {
    return defaultRepository ?? AutomationRepository.inMemory();
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
    return new AutomationRepository(new JsonFileStore({ filePath, seed: seedAutomationState() }));
  }

  static prisma({ client, fallback }: PrismaAutomationRepositoryOptions): AutomationRepository {
    return new AutomationRepository(
      new InMemoryStore(seedAutomationState()),
      new PrismaAutomationRepository(client, fallback ?? AutomationRepository.inMemory())
    );
  }

  readState(): AutomationState {
    if (this.adapter) {
      return this.adapter.readState();
    }

    return normalizeState(this.store.read());
  }

  findPublishIdempotencyKey(key: string): AutomationPublishIdempotencyRecord | undefined {
    if (this.adapter) {
      return this.adapter.findPublishIdempotencyKey(key);
    }

    return clone(this.readState().publishIdempotencyKeys.find((item) => item.key === key));
  }

  findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined {
    if (this.adapter) {
      return this.adapter.findProactiveDeliveryIdempotencyKey(key);
    }

    return clone(this.readState().proactiveDeliveryIdempotencyKeys.find((item) => item.key === key));
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

  listProactiveRules(): ProactiveRule[] {
    if (this.adapter) {
      return this.adapter.listProactiveRules();
    }

    return clone(this.readState().proactiveRules);
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

  listProactiveFrequencyCaps(filter: AutomationProactiveFrequencyCapFilter = {}): AutomationProactiveFrequencyCap[] {
    if (this.adapter) {
      return this.adapter.listProactiveFrequencyCaps(filter);
    }

    return clone(this.readState().proactiveFrequencyCaps.filter((cap) =>
      (!filter.ruleId || cap.ruleId === filter.ruleId) &&
      (!filter.tenantId || cap.tenantId === filter.tenantId)
    ));
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

  saveProactiveRule(rule: ProactiveRule): ProactiveRule {
    if (this.adapter) {
      return this.adapter.saveProactiveRule(rule);
    }

    const persisted = clone(rule);
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

  saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun {
    if (this.adapter) {
      return this.adapter.saveBotTestRun(run);
    }

    const persisted = clone(run);
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
    return this.fallback.findPublishIdempotencyKey(key);
  }

  findProactiveDeliveryIdempotencyKey(key: string): AutomationProactiveDeliveryIdempotencyRecord | undefined {
    return this.fallback.findProactiveDeliveryIdempotencyKey(key);
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
    return this.fallback.listProactiveRules();
  }

  listProactiveExecutionWindows(
    filter: AutomationProactiveExecutionWindowFilter = {}
  ): AutomationProactiveExecutionWindow[] {
    return this.fallback.listProactiveExecutionWindows(filter);
  }

  listProactiveFrequencyCaps(filter: AutomationProactiveFrequencyCapFilter = {}): AutomationProactiveFrequencyCap[] {
    return this.fallback.listProactiveFrequencyCaps(filter);
  }

  listProactiveExperimentAssignments(
    filter: AutomationProactiveExperimentAssignmentFilter = {}
  ): AutomationProactiveExperimentAssignment[] {
    return this.fallback.listProactiveExperimentAssignments(filter);
  }

  listProactiveDeliveryAttempts(
    filter: AutomationProactiveDeliveryAttemptFilter = {}
  ): AutomationProactiveDeliveryAttempt[] {
    return this.fallback.listProactiveDeliveryAttempts(filter);
  }

  listProactiveDeliveryAttributions(
    filter: AutomationProactiveDeliveryAttributionFilter = {}
  ): AutomationProactiveDeliveryAttribution[] {
    return this.fallback.listProactiveDeliveryAttributions(filter);
  }

  readState(): AutomationState {
    return this.fallback.readState();
  }

  async saveBotPublishAuditEvent(event: AutomationBotPublishAuditEvent): Promise<AutomationBotPublishAuditEvent> {
    const persisted = normalizeBotPublishAuditEventRecord(event);
    const existingByAuditId = await this.client.botPublishAuditEvent.findUnique({
      where: { auditId: persisted.auditId }
    });
    if (existingByAuditId) {
      const existing = toBotPublishAuditEvent(existingByAuditId);
      this.fallback.saveBotPublishAuditEvent(existing);
      return existing;
    }

    const existingByIdempotencyKey = await this.client.botPublishAuditEvent.findUnique({
      where: { idempotencyKey: persisted.idempotencyKey }
    });
    if (existingByIdempotencyKey) {
      const existing = toBotPublishAuditEvent(existingByIdempotencyKey);
      this.fallback.saveBotPublishAuditEvent(existing);
      return existing;
    }

    const row = await this.client.botPublishAuditEvent.create({
      data: toPrismaBotPublishAuditEventCreateInput(persisted)
    });
    const saved = toBotPublishAuditEvent(row);
    this.fallback.saveBotPublishAuditEvent(saved);
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
    this.fallback.saveBotScenario(saved);

    return saved;
  }

  async saveBotScenarioVersion(version: AutomationBotScenarioVersion): Promise<AutomationBotScenarioVersion> {
    const persisted = normalizeBotScenarioVersionRecord(version);
    const existing = await this.findBotScenarioVersion(persisted.versionId);
    if (existing) {
      this.fallback.saveBotScenarioVersion(existing);
      return existing;
    }

    const row = await this.client.botScenarioVersion.create({
      data: toPrismaBotScenarioVersionCreateInput(persisted)
    });
    const saved = toBotScenarioVersion(row);
    this.fallback.saveBotScenarioVersion(saved);
    return saved;
  }

  saveBotTestRun(run: AutomationBotTestRun): AutomationBotTestRun {
    return this.fallback.saveBotTestRun(run);
  }

  saveProactiveRule(rule: ProactiveRule): ProactiveRule {
    return this.fallback.saveProactiveRule(rule);
  }

  saveProactiveExecutionWindow(window: AutomationProactiveExecutionWindowInput): AutomationProactiveExecutionWindow {
    return this.fallback.saveProactiveExecutionWindow(window);
  }

  saveProactiveFrequencyCap(cap: AutomationProactiveFrequencyCapInput): AutomationProactiveFrequencyCap {
    return this.fallback.saveProactiveFrequencyCap(cap);
  }

  saveProactiveExperimentAssignment(
    assignment: AutomationProactiveExperimentAssignmentInput
  ): AutomationProactiveExperimentAssignment {
    return this.fallback.saveProactiveExperimentAssignment(assignment);
  }

  saveProactiveDeliveryAttempt(attempt: AutomationProactiveDeliveryAttemptInput): AutomationProactiveDeliveryAttempt {
    return this.fallback.saveProactiveDeliveryAttempt(attempt);
  }

  saveProactiveDeliveryAttribution(
    attribution: AutomationProactiveDeliveryAttributionInput
  ): AutomationProactiveDeliveryAttribution {
    return this.fallback.saveProactiveDeliveryAttribution(attribution);
  }

  saveProactiveDeliveryIdempotencyKey(
    record: AutomationProactiveDeliveryIdempotencyRecordInput
  ): AutomationProactiveDeliveryIdempotencyRecord {
    return this.fallback.saveProactiveDeliveryIdempotencyKey(record);
  }

  savePublishIdempotencyKey(record: AutomationPublishIdempotencyRecord): AutomationPublishIdempotencyRecord {
    return this.fallback.savePublishIdempotencyKey(record);
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
    publishIdempotencyKeys: []
  };
}

function normalizeState(state: Partial<AutomationState>): AutomationState {
  return {
    botPublishAuditEvents: (state.botPublishAuditEvents ?? []).map((event) =>
      normalizeBotPublishAuditEventRecord(event)
    ),
    botScenarios: (state.botScenarios ?? []).map((scenario) => normalizeBotScenarioRecord(scenario)),
    botScenarioVersions: (state.botScenarioVersions ?? []).map((version) => normalizeBotScenarioVersionRecord(version)),
    botTestRuns: state.botTestRuns ?? [],
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
    proactiveRules: state.proactiveRules ?? [],
    publishIdempotencyKeys: state.publishIdempotencyKeys ?? []
  };
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

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
