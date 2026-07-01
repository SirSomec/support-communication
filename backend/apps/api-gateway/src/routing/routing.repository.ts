import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue } from "./routing.fixtures.js";

export type RoutingLimitMode = "operator_channel_limit" | "queue_round_robin";
export type RoutingPriorityStrategy = "least_loaded" | "round_robin" | "skill_match";
export type QueueMembershipRole = "backup" | "observer" | "primary";
export type RoutingAnalyticsEventKind = "assignment" | "auto_return" | "rescue" | "transfer";

export interface RoutingRuleRecord {
  channel: string;
  enabled: boolean;
  id: string;
  limitMode: RoutingLimitMode;
  priorityStrategy: RoutingPriorityStrategy;
  tenantId: string;
  updatedAt: string;
  waitThresholdSeconds: number;
}

export interface QueueMembershipRecord {
  active: boolean;
  id: string;
  operatorId: string;
  queueId: string;
  role: QueueMembershipRole;
  tenantId: string;
  updatedAt: string;
}

export interface OperatorCapacityRecord {
  channel: string;
  chatLimit: number;
  id: string;
  operatorId: string;
  overrideAllowed: boolean;
  tenantId: string;
  updatedAt: string;
}

export interface RoutingAnalyticsRow {
  channel: string;
  conversationId: string;
  eventKind: RoutingAnalyticsEventKind;
  fromOperatorId?: string | null;
  id: string;
  occurredAt: string;
  source: string;
  tenantId: string;
  toOperatorId?: string | null;
}

export interface RoutingJobDescriptor {
  action?: string;
  attempts?: number;
  claimedAt?: string;
  completedAt?: string;
  conversationId?: string;
  deadLetteredAt?: string;
  id: string;
  kind?: string;
  lastError?: string;
  nextAttemptAt?: string | null;
  queue: string;
  runAt?: number | string;
  status?: string;
}

export interface RoutingState {
  conversations: RoutingConversation[];
  jobs: RoutingJobDescriptor[];
  operatorCapacities: OperatorCapacityRecord[];
  operators: RoutingOperator[];
  queueMemberships: QueueMembershipRecord[];
  queues: RoutingQueue[];
  routingAnalyticsRows: RoutingAnalyticsRow[];
  rescueReportRows: RescueReportRow[];
  routingRules: RoutingRuleRecord[];
}

export interface RoutingTenantScope {
  tenantId?: string;
}

export interface RoutingRuleFilters extends RoutingTenantScope {
  channel?: string;
  enabled?: boolean;
}

export interface QueueMembershipFilters extends RoutingTenantScope {
  active?: boolean;
  operatorId?: string;
  queueId?: string;
}

export interface OperatorCapacityFilters extends RoutingTenantScope {
  channel?: string;
  operatorId?: string;
}

export interface RoutingAnalyticsFilters extends RoutingTenantScope {
  eventKind?: RoutingAnalyticsEventKind;
}

interface RoutingRepositoryOptions {
  filePath: string;
}

export interface PrismaRoutingRepositoryOptions {
  client: PrismaRoutingClient;
  fallback?: RoutingRepositoryPort;
}

type MaybePromise<T> = T | Promise<T>;

export interface RoutingRepositoryPort {
  findOperatorCapacity(capacityId: string, scope?: RoutingTenantScope): MaybePromise<OperatorCapacityRecord | undefined>;
  findOperatorCapacityByOperatorChannel(tenantId: string, operatorId: string, channel: string): MaybePromise<OperatorCapacityRecord | undefined>;
  findQueueMembership(membershipId: string, scope?: RoutingTenantScope): MaybePromise<QueueMembershipRecord | undefined>;
  findRoutingRule(ruleId: string, scope?: RoutingTenantScope): MaybePromise<RoutingRuleRecord | undefined>;
  findRoutingRuleByChannel(tenantId: string, channel: string): MaybePromise<RoutingRuleRecord | undefined>;
  listJobs(): RoutingJobDescriptor[];
  listOperatorCapacities(filters?: OperatorCapacityFilters): OperatorCapacityRecord[] | Promise<OperatorCapacityRecord[]>;
  listQueueMemberships(filters?: QueueMembershipFilters): QueueMembershipRecord[] | Promise<QueueMembershipRecord[]>;
  listRoutingAnalyticsRows(filters?: RoutingAnalyticsFilters): RoutingAnalyticsRow[] | Promise<RoutingAnalyticsRow[]>;
  listRoutingRules(filters?: RoutingRuleFilters): RoutingRuleRecord[] | Promise<RoutingRuleRecord[]>;
  readState(): RoutingState;
  saveJob(job: RoutingJobDescriptor): RoutingJobDescriptor;
  saveOperatorCapacity(capacity: OperatorCapacityRecord): OperatorCapacityRecord | Promise<OperatorCapacityRecord>;
  saveQueueMembership(membership: QueueMembershipRecord): QueueMembershipRecord | Promise<QueueMembershipRecord>;
  saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow | Promise<RoutingAnalyticsRow>;
  saveRoutingRule(rule: RoutingRuleRecord): RoutingRuleRecord | Promise<RoutingRuleRecord>;
  saveState(state: RoutingState): RoutingState;
}

export interface PrismaRoutingClient {
  operatorCapacity: {
    findFirst(input: { where: PrismaOperatorCapacityWhereInput }): Promise<PrismaOperatorCapacityRow | null>;
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaOperatorCapacityWhereInput }): Promise<PrismaOperatorCapacityRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaOperatorCapacityRow | null>;
    upsert(input: {
      create: PrismaOperatorCapacityCreateInput;
      update: PrismaOperatorCapacityUpdateInput;
      where: { id: string };
    }): Promise<PrismaOperatorCapacityRow>;
  };
  queueMembership: {
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaQueueMembershipWhereInput }): Promise<PrismaQueueMembershipRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaQueueMembershipRow | null>;
    upsert(input: {
      create: PrismaQueueMembershipCreateInput;
      update: PrismaQueueMembershipUpdateInput;
      where: { id: string };
    }): Promise<PrismaQueueMembershipRow>;
  };
  routingAnalyticsRow: {
    findMany(input: { orderBy: { occurredAt: "desc" }; where?: PrismaRoutingAnalyticsWhereInput }): Promise<PrismaRoutingAnalyticsRow[]>;
    upsert(input: {
      create: PrismaRoutingAnalyticsCreateInput;
      update: PrismaRoutingAnalyticsUpdateInput;
      where: { id: string };
    }): Promise<PrismaRoutingAnalyticsRow>;
  };
  routingRule: {
    findFirst(input: { where: PrismaRoutingRuleWhereInput }): Promise<PrismaRoutingRuleRow | null>;
    findMany(input: { orderBy: { updatedAt: "desc" }; where?: PrismaRoutingRuleWhereInput }): Promise<PrismaRoutingRuleRow[]>;
    findUnique(input: { where: { id: string } }): Promise<PrismaRoutingRuleRow | null>;
    upsert(input: {
      create: PrismaRoutingRuleCreateInput;
      update: PrismaRoutingRuleUpdateInput;
      where: { id: string };
    }): Promise<PrismaRoutingRuleRow>;
  };
}

interface PrismaRoutingRuleWhereInput {
  channel?: string;
  enabled?: boolean;
  id?: string;
  tenantId?: string;
}

interface PrismaQueueMembershipWhereInput {
  active?: boolean;
  id?: string;
  operatorId?: string;
  queueId?: string;
  tenantId?: string;
}

interface PrismaOperatorCapacityWhereInput {
  channel?: string;
  id?: string;
  operatorId?: string;
  tenantId?: string;
}

interface PrismaRoutingAnalyticsWhereInput {
  eventKind?: string;
  tenantId?: string;
}

interface PrismaRoutingRuleRow {
  channel: string;
  enabled: boolean;
  id: string;
  limitMode: string;
  priorityStrategy: string;
  tenantId: string;
  updatedAt: Date;
  waitThresholdSeconds: number;
}

interface PrismaQueueMembershipRow {
  active: boolean;
  id: string;
  operatorId: string;
  queueId: string;
  role: string;
  tenantId: string;
  updatedAt: Date;
}

interface PrismaOperatorCapacityRow {
  channel: string;
  chatLimit: number;
  id: string;
  operatorId: string;
  overrideAllowed: boolean;
  tenantId: string;
  updatedAt: Date;
}

interface PrismaRoutingAnalyticsRow {
  channel: string;
  conversationId: string;
  createdAt: Date;
  eventKind: string;
  fromOperatorId: string | null;
  id: string;
  occurredAt: Date;
  source: string;
  tenantId: string;
  toOperatorId: string | null;
}

interface PrismaRoutingRuleCreateInput {
  channel: string;
  enabled: boolean;
  id: string;
  limitMode: string;
  priorityStrategy: string;
  tenantId: string;
  updatedAt: Date;
  waitThresholdSeconds: number;
}

type PrismaRoutingRuleUpdateInput = Omit<PrismaRoutingRuleCreateInput, "id">;

interface PrismaQueueMembershipCreateInput {
  active: boolean;
  id: string;
  operatorId: string;
  queueId: string;
  role: string;
  tenantId: string;
  updatedAt: Date;
}

type PrismaQueueMembershipUpdateInput = Omit<PrismaQueueMembershipCreateInput, "id">;

interface PrismaOperatorCapacityCreateInput {
  channel: string;
  chatLimit: number;
  id: string;
  operatorId: string;
  overrideAllowed: boolean;
  tenantId: string;
  updatedAt: Date;
}

type PrismaOperatorCapacityUpdateInput = Omit<PrismaOperatorCapacityCreateInput, "id">;

interface PrismaRoutingAnalyticsCreateInput {
  channel: string;
  conversationId: string;
  eventKind: string;
  fromOperatorId: string | null;
  id: string;
  occurredAt: Date;
  source: string;
  tenantId: string;
  toOperatorId: string | null;
}

type PrismaRoutingAnalyticsUpdateInput = Omit<PrismaRoutingAnalyticsCreateInput, "id">;

let defaultRepository: RoutingRepository | null = null;

export class RoutingRepository implements RoutingRepositoryPort {
  private constructor(private readonly adapter: RoutingRepositoryPort) {}

  static default(): RoutingRepository {
    defaultRepository ??= RoutingRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: RoutingRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: Partial<RoutingState> = seedRoutingState()): RoutingRepository {
    return new RoutingRepository(createDurableRoutingRepository(new InMemoryStore(normalizeState(seed))));
  }

  static open({ filePath }: RoutingRepositoryOptions): RoutingRepository {
    return new RoutingRepository(createDurableRoutingRepository(new JsonFileStore({ filePath, seed: seedRoutingState() })));
  }

  static prisma({ client, fallback }: PrismaRoutingRepositoryOptions): RoutingRepository {
    return new RoutingRepository(new PrismaRoutingRepository(client, fallback));
  }

  findOperatorCapacity(capacityId: string, scope: RoutingTenantScope = {}): MaybePromise<OperatorCapacityRecord | undefined> {
    return this.adapter.findOperatorCapacity(capacityId, scope);
  }

  findOperatorCapacityByOperatorChannel(tenantId: string, operatorId: string, channel: string): MaybePromise<OperatorCapacityRecord | undefined> {
    return this.adapter.findOperatorCapacityByOperatorChannel(tenantId, operatorId, channel);
  }

  findQueueMembership(membershipId: string, scope: RoutingTenantScope = {}): MaybePromise<QueueMembershipRecord | undefined> {
    return this.adapter.findQueueMembership(membershipId, scope);
  }

  findRoutingRule(ruleId: string, scope: RoutingTenantScope = {}): MaybePromise<RoutingRuleRecord | undefined> {
    return this.adapter.findRoutingRule(ruleId, scope);
  }

  findRoutingRuleByChannel(tenantId: string, channel: string): MaybePromise<RoutingRuleRecord | undefined> {
    return this.adapter.findRoutingRuleByChannel(tenantId, channel);
  }

  listJobs(): RoutingJobDescriptor[] {
    return this.adapter.listJobs();
  }

  listOperatorCapacities(filters: OperatorCapacityFilters = {}): OperatorCapacityRecord[] | Promise<OperatorCapacityRecord[]> {
    return this.adapter.listOperatorCapacities(filters);
  }

  listQueueMemberships(filters: QueueMembershipFilters = {}): QueueMembershipRecord[] | Promise<QueueMembershipRecord[]> {
    return this.adapter.listQueueMemberships(filters);
  }

  listRoutingAnalyticsRows(filters: RoutingAnalyticsFilters = {}): RoutingAnalyticsRow[] | Promise<RoutingAnalyticsRow[]> {
    return this.adapter.listRoutingAnalyticsRows(filters);
  }

  listRoutingRules(filters: RoutingRuleFilters = {}): RoutingRuleRecord[] | Promise<RoutingRuleRecord[]> {
    return this.adapter.listRoutingRules(filters);
  }

  readState(): RoutingState {
    return this.adapter.readState();
  }

  saveJob(job: RoutingJobDescriptor): RoutingJobDescriptor {
    return this.adapter.saveJob(job);
  }

  saveOperatorCapacity(capacity: OperatorCapacityRecord): OperatorCapacityRecord | Promise<OperatorCapacityRecord> {
    return this.adapter.saveOperatorCapacity(capacity);
  }

  saveQueueMembership(membership: QueueMembershipRecord): QueueMembershipRecord | Promise<QueueMembershipRecord> {
    return this.adapter.saveQueueMembership(membership);
  }

  saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow | Promise<RoutingAnalyticsRow> {
    return this.adapter.saveRoutingAnalyticsRow(row);
  }

  saveRoutingRule(rule: RoutingRuleRecord): RoutingRuleRecord | Promise<RoutingRuleRecord> {
    return this.adapter.saveRoutingRule(rule);
  }

  saveState(state: RoutingState): RoutingState {
    return this.adapter.saveState(state);
  }
}

class PrismaRoutingRepository implements RoutingRepositoryPort {
  constructor(private readonly client: PrismaRoutingClient, private readonly fallback: RoutingRepositoryPort = RoutingRepository.inMemory()) {}

  async findOperatorCapacity(capacityId: string, scope: RoutingTenantScope = {}): Promise<OperatorCapacityRecord | undefined> {
    const row = await this.client.operatorCapacity.findUnique({ where: { id: capacityId } });
    return row && isRoutingRecordInScope(row.tenantId, scope) ? toOperatorCapacityRecord(row) : undefined;
  }

  async findOperatorCapacityByOperatorChannel(tenantId: string, operatorId: string, channel: string): Promise<OperatorCapacityRecord | undefined> {
    const row = await this.client.operatorCapacity.findFirst({
      where: { channel, operatorId, tenantId }
    });

    return row ? toOperatorCapacityRecord(row) : undefined;
  }

  async findQueueMembership(membershipId: string, scope: RoutingTenantScope = {}): Promise<QueueMembershipRecord | undefined> {
    const row = await this.client.queueMembership.findUnique({ where: { id: membershipId } });
    return row && isRoutingRecordInScope(row.tenantId, scope) ? toQueueMembershipRecord(row) : undefined;
  }

  async findRoutingRule(ruleId: string, scope: RoutingTenantScope = {}): Promise<RoutingRuleRecord | undefined> {
    const row = await this.client.routingRule.findUnique({ where: { id: ruleId } });
    return row && isRoutingRecordInScope(row.tenantId, scope) ? toRoutingRuleRecord(row) : undefined;
  }

  async findRoutingRuleByChannel(tenantId: string, channel: string): Promise<RoutingRuleRecord | undefined> {
    const row = await this.client.routingRule.findFirst({
      where: { channel, enabled: true, tenantId }
    });

    return row ? toRoutingRuleRecord(row) : undefined;
  }

  listJobs(): RoutingJobDescriptor[] {
    return this.fallback.listJobs();
  }

  async listOperatorCapacities(filters: OperatorCapacityFilters = {}): Promise<OperatorCapacityRecord[]> {
    const rows = await this.client.operatorCapacity.findMany({
      orderBy: { updatedAt: "desc" },
      ...(filters.tenantId || filters.channel || filters.operatorId ? { where: operatorCapacityWhere(filters) } : {})
    });

    return rows.map(toOperatorCapacityRecord);
  }

  async listQueueMemberships(filters: QueueMembershipFilters = {}): Promise<QueueMembershipRecord[]> {
    const rows = await this.client.queueMembership.findMany({
      orderBy: { updatedAt: "desc" },
      ...(filters.tenantId || filters.queueId || filters.operatorId || filters.active !== undefined ? { where: queueMembershipWhere(filters) } : {})
    });

    return rows.map(toQueueMembershipRecord);
  }

  async listRoutingAnalyticsRows(filters: RoutingAnalyticsFilters = {}): Promise<RoutingAnalyticsRow[]> {
    const rows = await this.client.routingAnalyticsRow.findMany({
      orderBy: { occurredAt: "desc" },
      ...(filters.tenantId || filters.eventKind ? { where: routingAnalyticsWhere(filters) } : {})
    });

    return rows.map(toRoutingAnalyticsRow);
  }

  async listRoutingRules(filters: RoutingRuleFilters = {}): Promise<RoutingRuleRecord[]> {
    const rows = await this.client.routingRule.findMany({
      orderBy: { updatedAt: "desc" },
      ...(filters.tenantId || filters.channel || filters.enabled !== undefined ? { where: routingRuleWhere(filters) } : {})
    });

    return rows.map(toRoutingRuleRecord);
  }

  readState(): RoutingState {
    return this.fallback.readState();
  }

  saveJob(job: RoutingJobDescriptor): RoutingJobDescriptor {
    return this.fallback.saveJob(job);
  }

  async saveOperatorCapacity(capacity: OperatorCapacityRecord): Promise<OperatorCapacityRecord> {
    const normalized = normalizeOperatorCapacityRecord(capacity);
    const existing = await this.findOperatorCapacityByOperatorChannel(normalized.tenantId, normalized.operatorId, normalized.channel);
    assertNaturalKeyAvailable(existing ? [existing] : [], normalized, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
    const create = toPrismaOperatorCapacityCreateInput(capacity);
    const row = await this.client.operatorCapacity.upsert({
      create,
      update: toPrismaOperatorCapacityUpdateInput(create),
      where: { id: capacity.id }
    });

    return toOperatorCapacityRecord(row);
  }

  async saveQueueMembership(membership: QueueMembershipRecord): Promise<QueueMembershipRecord> {
    const normalized = normalizeQueueMembershipRecord(membership);
    const existing = await this.listQueueMemberships({
      operatorId: normalized.operatorId,
      queueId: normalized.queueId,
      tenantId: normalized.tenantId
    });
    assertNaturalKeyAvailable(existing, normalized, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
    const create = toPrismaQueueMembershipCreateInput(membership);
    const row = await this.client.queueMembership.upsert({
      create,
      update: toPrismaQueueMembershipUpdateInput(create),
      where: { id: membership.id }
    });

    return toQueueMembershipRecord(row);
  }

  async saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): Promise<RoutingAnalyticsRow> {
    const create = toPrismaRoutingAnalyticsCreateInput(row);
    const persisted = await this.client.routingAnalyticsRow.upsert({
      create,
      update: toPrismaRoutingAnalyticsUpdateInput(create),
      where: { id: row.id }
    });

    return toRoutingAnalyticsRow(persisted);
  }

  async saveRoutingRule(rule: RoutingRuleRecord): Promise<RoutingRuleRecord> {
    const normalized = normalizeRoutingRuleRecord(rule);
    const existing = await this.client.routingRule.findFirst({
      where: { channel: normalized.channel, tenantId: normalized.tenantId }
    });
    assertNaturalKeyAvailable(existing ? [toRoutingRuleRecord(existing)] : [], normalized, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
    const create = toPrismaRoutingRuleCreateInput(rule);
    const row = await this.client.routingRule.upsert({
      create,
      update: toPrismaRoutingRuleUpdateInput(create),
      where: { id: rule.id }
    });

    return toRoutingRuleRecord(row);
  }

  saveState(state: RoutingState): RoutingState {
    return this.fallback.saveState(state);
  }
}

function createDurableRoutingRepository(store: DurableStore<RoutingState>): RoutingRepositoryPort {
  return {
    findOperatorCapacity(capacityId: string, scope: RoutingTenantScope = {}): OperatorCapacityRecord | undefined {
      const record = readState(store).operatorCapacities.find((item) => item.id === capacityId);
      return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
    },

    findOperatorCapacityByOperatorChannel(tenantId: string, operatorId: string, channel: string): OperatorCapacityRecord | undefined {
      const record = readState(store).operatorCapacities.find((item) =>
        item.tenantId === tenantId && item.operatorId === operatorId && item.channel === channel
      );

      return record ? clone(record) : undefined;
    },

    findQueueMembership(membershipId: string, scope: RoutingTenantScope = {}): QueueMembershipRecord | undefined {
      const record = readState(store).queueMemberships.find((item) => item.id === membershipId);
      return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
    },

    findRoutingRule(ruleId: string, scope: RoutingTenantScope = {}): RoutingRuleRecord | undefined {
      const record = readState(store).routingRules.find((item) => item.id === ruleId);
      return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
    },

    findRoutingRuleByChannel(tenantId: string, channel: string): RoutingRuleRecord | undefined {
      const record = readState(store).routingRules.find((item) =>
        item.tenantId === tenantId && item.channel === channel && item.enabled
      );

      return record ? clone(record) : undefined;
    },

    listJobs(): RoutingJobDescriptor[] {
      return clone(readState(store).jobs);
    },

    listOperatorCapacities(filters: OperatorCapacityFilters = {}): OperatorCapacityRecord[] {
      return clone(readState(store).operatorCapacities.filter((item) => isOperatorCapacityInScope(item, filters)));
    },

    listQueueMemberships(filters: QueueMembershipFilters = {}): QueueMembershipRecord[] {
      return clone(readState(store).queueMemberships.filter((item) => isQueueMembershipInScope(item, filters)));
    },

    listRoutingAnalyticsRows(filters: RoutingAnalyticsFilters = {}): RoutingAnalyticsRow[] {
      return clone(readState(store).routingAnalyticsRows.filter((item) => isRoutingAnalyticsRowInScope(item, filters)));
    },

    listRoutingRules(filters: RoutingRuleFilters = {}): RoutingRuleRecord[] {
      return clone(readState(store).routingRules.filter((item) => isRoutingRuleInScope(item, filters)));
    },

    readState(): RoutingState {
      return clone(readState(store));
    },

    saveJob(job: RoutingJobDescriptor): RoutingJobDescriptor {
      const persisted = clone(job);
      store.update((state) => {
        const current = normalizeState(state);
        const exists = current.jobs.some((item) => item.id === persisted.id);

        return {
          ...current,
          jobs: exists
            ? current.jobs.map((item) => item.id === persisted.id ? persisted : item)
            : [...current.jobs, persisted]
        };
      });

      return clone(persisted);
    },

    saveOperatorCapacity(capacity: OperatorCapacityRecord): OperatorCapacityRecord {
      const persisted = normalizeOperatorCapacityRecord(capacity);
      store.update((state) => {
        const current = normalizeState(state);
        assertNaturalKeyAvailable(current.operatorCapacities, persisted, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
        return upsertRecord(current, "operatorCapacities", persisted);
      });
      return clone(persisted);
    },

    saveQueueMembership(membership: QueueMembershipRecord): QueueMembershipRecord {
      const persisted = normalizeQueueMembershipRecord(membership);
      store.update((state) => {
        const current = normalizeState(state);
        assertNaturalKeyAvailable(current.queueMemberships, persisted, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
        return upsertRecord(current, "queueMemberships", persisted);
      });
      return clone(persisted);
    },

    saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow {
      const persisted = normalizeRoutingAnalyticsRow(row);
      store.update((state) => {
        const current = normalizeState(state);
        const exists = current.routingAnalyticsRows.some((item) => item.id === persisted.id);

        return {
          ...current,
          routingAnalyticsRows: exists
            ? current.routingAnalyticsRows.map((item) => item.id === persisted.id ? persisted : item)
            : [...current.routingAnalyticsRows, persisted]
        };
      });

      return clone(persisted);
    },

    saveRoutingRule(rule: RoutingRuleRecord): RoutingRuleRecord {
      const persisted = normalizeRoutingRuleRecord(rule);
      store.update((state) => {
        const current = normalizeState(state);
        assertNaturalKeyAvailable(current.routingRules, persisted, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
        return upsertRecord(current, "routingRules", persisted);
      });
      return clone(persisted);
    },

    saveState(state: RoutingState): RoutingState {
      const normalized = normalizeState(state);
      store.write(normalized);
      return clone(normalized);
    }
  };
}

function seedRoutingState(): RoutingState {
  return {
    conversations: [],
    jobs: [],
    operatorCapacities: [],
    operators: [],
    queueMemberships: [],
    queues: [],
    routingAnalyticsRows: [],
    rescueReportRows: [],
    routingRules: []
  };
}

function normalizeState(state: Partial<RoutingState>): RoutingState {
  return {
    conversations: state.conversations ?? [],
    jobs: state.jobs ?? [],
    operatorCapacities: (state.operatorCapacities ?? []).map(normalizeOperatorCapacityRecord),
    operators: state.operators ?? [],
    queueMemberships: (state.queueMemberships ?? []).map(normalizeQueueMembershipRecord),
    queues: state.queues ?? [],
    routingAnalyticsRows: (state.routingAnalyticsRows ?? []).map(normalizeRoutingAnalyticsRow),
    rescueReportRows: state.rescueReportRows ?? [],
    routingRules: (state.routingRules ?? []).map(normalizeRoutingRuleRecord)
  };
}

function readState(store: DurableStore<RoutingState>): RoutingState {
  return normalizeState(store.read());
}

function upsertRecord<T extends { id: string }>(state: RoutingState, key: "operatorCapacities" | "queueMemberships" | "routingRules", record: T): RoutingState {
  const current = state[key];
  const exists = current.some((item) => item.id === record.id);

  return {
    ...state,
    [key]: exists
      ? current.map((item) => item.id === record.id ? record : item)
      : [...current, record]
  };
}

function assertNaturalKeyAvailable<T extends { id: string }>(
  records: readonly T[],
  record: T,
  isSameNaturalKey: (left: T, right: T) => boolean,
  code: string
): void {
  const conflicting = records.find((item) => item.id !== record.id && isSameNaturalKey(item, record));
  if (conflicting) {
    throw new Error(`${code}:${record.id}:${conflicting.id}`);
  }
}

function isSameRoutingRuleNaturalKey(left: RoutingRuleRecord, right: RoutingRuleRecord): boolean {
  return left.tenantId === right.tenantId && left.channel === right.channel;
}

function isSameQueueMembershipNaturalKey(left: QueueMembershipRecord, right: QueueMembershipRecord): boolean {
  return left.tenantId === right.tenantId && left.queueId === right.queueId && left.operatorId === right.operatorId;
}

function isSameOperatorCapacityNaturalKey(left: OperatorCapacityRecord, right: OperatorCapacityRecord): boolean {
  return left.tenantId === right.tenantId && left.operatorId === right.operatorId && left.channel === right.channel;
}

function isRoutingRecordInScope(tenantId: string, scope: RoutingTenantScope): boolean {
  return !scope.tenantId || tenantId === scope.tenantId;
}

function isRoutingRuleInScope(rule: RoutingRuleRecord, filters: RoutingRuleFilters): boolean {
  return isRoutingRecordInScope(rule.tenantId, filters)
    && (!filters.channel || rule.channel === filters.channel)
    && (filters.enabled === undefined || rule.enabled === filters.enabled);
}

function isQueueMembershipInScope(membership: QueueMembershipRecord, filters: QueueMembershipFilters): boolean {
  return isRoutingRecordInScope(membership.tenantId, filters)
    && (!filters.queueId || membership.queueId === filters.queueId)
    && (!filters.operatorId || membership.operatorId === filters.operatorId)
    && (filters.active === undefined || membership.active === filters.active);
}

function isOperatorCapacityInScope(capacity: OperatorCapacityRecord, filters: OperatorCapacityFilters): boolean {
  return isRoutingRecordInScope(capacity.tenantId, filters)
    && (!filters.channel || capacity.channel === filters.channel)
    && (!filters.operatorId || capacity.operatorId === filters.operatorId);
}

function isRoutingAnalyticsRowInScope(row: RoutingAnalyticsRow, filters: RoutingAnalyticsFilters): boolean {
  return isRoutingRecordInScope(row.tenantId, filters)
    && (!filters.eventKind || row.eventKind === filters.eventKind);
}

function routingRuleWhere(filters: RoutingRuleFilters): PrismaRoutingRuleWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {})
  };
}

function queueMembershipWhere(filters: QueueMembershipFilters): PrismaQueueMembershipWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.queueId ? { queueId: filters.queueId } : {}),
    ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
    ...(filters.active !== undefined ? { active: filters.active } : {})
  };
}

function operatorCapacityWhere(filters: OperatorCapacityFilters): PrismaOperatorCapacityWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.operatorId ? { operatorId: filters.operatorId } : {})
  };
}

function routingAnalyticsWhere(filters: RoutingAnalyticsFilters): PrismaRoutingAnalyticsWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.eventKind ? { eventKind: filters.eventKind } : {})
  };
}

function normalizeRoutingRuleRecord(rule: RoutingRuleRecord): RoutingRuleRecord {
  return {
    channel: rule.channel.trim(),
    enabled: Boolean(rule.enabled),
    id: rule.id,
    limitMode: parseRoutingLimitMode(rule.limitMode),
    priorityStrategy: parseRoutingPriorityStrategy(rule.priorityStrategy),
    tenantId: rule.tenantId,
    updatedAt: rule.updatedAt,
    waitThresholdSeconds: parseNonNegativeInteger(rule.waitThresholdSeconds, "waitThresholdSeconds")
  };
}

function normalizeQueueMembershipRecord(membership: QueueMembershipRecord): QueueMembershipRecord {
  return {
    active: Boolean(membership.active),
    id: membership.id,
    operatorId: membership.operatorId,
    queueId: membership.queueId,
    role: parseQueueMembershipRole(membership.role),
    tenantId: membership.tenantId,
    updatedAt: membership.updatedAt
  };
}

function normalizeOperatorCapacityRecord(capacity: OperatorCapacityRecord): OperatorCapacityRecord {
  return {
    channel: capacity.channel.trim(),
    chatLimit: parseNonNegativeInteger(capacity.chatLimit, "chatLimit"),
    id: capacity.id,
    operatorId: capacity.operatorId,
    overrideAllowed: Boolean(capacity.overrideAllowed),
    tenantId: capacity.tenantId,
    updatedAt: capacity.updatedAt
  };
}

function normalizeRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow {
  return {
    channel: row.channel.trim(),
    conversationId: row.conversationId,
    eventKind: parseRoutingAnalyticsEventKind(row.eventKind),
    fromOperatorId: row.fromOperatorId ?? null,
    id: row.id,
    occurredAt: row.occurredAt,
    source: row.source.trim(),
    tenantId: row.tenantId,
    toOperatorId: row.toOperatorId ?? null
  };
}

function parseRoutingLimitMode(value: string): RoutingLimitMode {
  if (value === "operator_channel_limit" || value === "queue_round_robin") {
    return value;
  }

  throw new Error(`Unsupported routing limit mode: ${value}`);
}

function parseRoutingPriorityStrategy(value: string): RoutingPriorityStrategy {
  if (value === "least_loaded" || value === "round_robin" || value === "skill_match") {
    return value;
  }

  throw new Error(`Unsupported routing priority strategy: ${value}`);
}

function parseQueueMembershipRole(value: string): QueueMembershipRole {
  if (value === "primary" || value === "backup" || value === "observer") {
    return value;
  }

  throw new Error(`Unsupported queue membership role: ${value}`);
}

function parseRoutingAnalyticsEventKind(value: string): RoutingAnalyticsEventKind {
  if (value === "assignment" || value === "auto_return" || value === "rescue" || value === "transfer") {
    return value;
  }

  throw new Error(`Unsupported routing analytics event kind: ${value}`);
}

function parseNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
}

function toRoutingRuleRecord(row: PrismaRoutingRuleRow): RoutingRuleRecord {
  return normalizeRoutingRuleRecord({
    channel: row.channel,
    enabled: row.enabled,
    id: row.id,
    limitMode: row.limitMode as RoutingLimitMode,
    priorityStrategy: row.priorityStrategy as RoutingPriorityStrategy,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString(),
    waitThresholdSeconds: row.waitThresholdSeconds
  });
}

function toQueueMembershipRecord(row: PrismaQueueMembershipRow): QueueMembershipRecord {
  return normalizeQueueMembershipRecord({
    active: row.active,
    id: row.id,
    operatorId: row.operatorId,
    queueId: row.queueId,
    role: row.role as QueueMembershipRole,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString()
  });
}

function toOperatorCapacityRecord(row: PrismaOperatorCapacityRow): OperatorCapacityRecord {
  return normalizeOperatorCapacityRecord({
    channel: row.channel,
    chatLimit: row.chatLimit,
    id: row.id,
    operatorId: row.operatorId,
    overrideAllowed: row.overrideAllowed,
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString()
  });
}

function toRoutingAnalyticsRow(row: PrismaRoutingAnalyticsRow): RoutingAnalyticsRow {
  return normalizeRoutingAnalyticsRow({
    channel: row.channel,
    conversationId: row.conversationId,
    eventKind: row.eventKind as RoutingAnalyticsEventKind,
    fromOperatorId: row.fromOperatorId,
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    source: row.source,
    tenantId: row.tenantId,
    toOperatorId: row.toOperatorId
  });
}

function toPrismaRoutingRuleCreateInput(rule: RoutingRuleRecord): PrismaRoutingRuleCreateInput {
  const normalized = normalizeRoutingRuleRecord(rule);
  return {
    channel: normalized.channel,
    enabled: normalized.enabled,
    id: normalized.id,
    limitMode: normalized.limitMode,
    priorityStrategy: normalized.priorityStrategy,
    tenantId: normalized.tenantId,
    updatedAt: new Date(normalized.updatedAt),
    waitThresholdSeconds: normalized.waitThresholdSeconds
  };
}

function toPrismaRoutingRuleUpdateInput(create: PrismaRoutingRuleCreateInput): PrismaRoutingRuleUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function toPrismaQueueMembershipCreateInput(membership: QueueMembershipRecord): PrismaQueueMembershipCreateInput {
  const normalized = normalizeQueueMembershipRecord(membership);
  return {
    active: normalized.active,
    id: normalized.id,
    operatorId: normalized.operatorId,
    queueId: normalized.queueId,
    role: normalized.role,
    tenantId: normalized.tenantId,
    updatedAt: new Date(normalized.updatedAt)
  };
}

function toPrismaQueueMembershipUpdateInput(create: PrismaQueueMembershipCreateInput): PrismaQueueMembershipUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function toPrismaOperatorCapacityCreateInput(capacity: OperatorCapacityRecord): PrismaOperatorCapacityCreateInput {
  const normalized = normalizeOperatorCapacityRecord(capacity);
  return {
    channel: normalized.channel,
    chatLimit: normalized.chatLimit,
    id: normalized.id,
    operatorId: normalized.operatorId,
    overrideAllowed: normalized.overrideAllowed,
    tenantId: normalized.tenantId,
    updatedAt: new Date(normalized.updatedAt)
  };
}

function toPrismaOperatorCapacityUpdateInput(create: PrismaOperatorCapacityCreateInput): PrismaOperatorCapacityUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function toPrismaRoutingAnalyticsCreateInput(row: RoutingAnalyticsRow): PrismaRoutingAnalyticsCreateInput {
  const normalized = normalizeRoutingAnalyticsRow(row);
  return {
    channel: normalized.channel,
    conversationId: normalized.conversationId,
    eventKind: normalized.eventKind,
    fromOperatorId: normalized.fromOperatorId ?? null,
    id: normalized.id,
    occurredAt: new Date(normalized.occurredAt),
    source: normalized.source,
    tenantId: normalized.tenantId,
    toOperatorId: normalized.toOperatorId ?? null
  };
}

function toPrismaRoutingAnalyticsUpdateInput(create: PrismaRoutingAnalyticsCreateInput): PrismaRoutingAnalyticsUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
