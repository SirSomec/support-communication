import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { Prisma } from "@prisma/client";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { bootstrapRoutingState } from "./seed.js";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue } from "./routing.types.js";

export type RoutingLimitMode = "operator_channel_limit" | "queue_round_robin";
export type RoutingPriorityStrategy = "least_loaded" | "round_robin" | "skill_match";
export type QueueMembershipRole = "backup" | "observer" | "primary";
export type RoutingAnalyticsEventKind = "assignment" | "auto_return" | "rescue" | "transfer";
const ROUTING_STATE_SNAPSHOT_ID = "default";

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
  appliedAssignments?: Array<Record<string, unknown>>;
  attempts?: number;
  auditEvent?: Record<string, unknown>;
  claimedAt?: string;
  completedAt?: string;
  conversationId?: string;
  deadLetteredAt?: string;
  id: string;
  kind?: string;
  lastError?: string;
  nextAttemptAt?: string | null;
  queue: string;
  redistributionId?: string;
  runAt?: number | string;
  selectedQueues?: string[];
  status?: string;
  tenantId?: string;
}

export interface RoutingJobClaimInput {
  claimedAt: string;
  expectedStatus: string | null;
  jobId: string;
  queue: string;
}

export interface RoutingSlaTimerApplyInput {
  action: "mark_sla_overdue" | "resume_sla";
  completedAt: string;
  conversationId: string;
  jobId: string;
  toSlaTone?: "danger";
  toStatus: "active" | "assigned";
}

export interface RoutingSlaTimerApplyResult {
  conversationId: string;
  jobId: string;
  overdueDescriptor?: {
    conversationId: string;
    jobId: string;
    kind: "sla.timer.overdue";
    occurredAt: string;
    queue: "sla-timers";
  };
  realtimeEvent?: {
    data: {
      jobId: string;
      state: "overdue";
    };
    occurredAt: string;
    resourceId: string;
    resourceType: "conversation";
    type: "sla.timer.updated";
  };
  reason?: "conversation_mismatch" | "conversation_not_found" | "job_not_claimed" | "not_active" | "not_paused" | "unsupported_action" | "unsupported_queue";
  status: "applied" | "skipped";
}

export interface RoutingRescueReturnApplyInput {
  completedAt: string;
  fallbackConversationId?: string | null;
  jobId: string;
  tenantId?: string;
}

export interface RoutingRescueReturnApplyResult {
  analyticsDescriptor?: {
    channel: string;
    conversationId: string;
    jobId: string;
    kind: "routing.rescue.auto_returned";
    occurredAt: string;
    operatorId: string | null;
  };
  conversationId: string | null;
  jobId: string;
  reason?: "conversation_not_found" | "job_not_claimed" | "missing_conversation_id" | "not_active_rescue" | "tenant_context_mismatch" | "tenant_context_required" | "unsupported_action" | "unsupported_queue";
  realtimeEvent?: {
    data: {
      jobId: string;
      state: "returned_to_queue";
    };
    occurredAt: string;
    resourceId: string;
    resourceType: "conversation";
    type: "rescue.countdown.updated";
  };
  status: "applied" | "skipped";
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
  seed?: Partial<RoutingState>;
}

export interface PrismaRoutingRepositoryOptions {
  client: PrismaRoutingClient;
  fallback?: RoutingRepositoryPort;
}

type MaybePromise<T> = T | Promise<T>;

export interface RoutingRepositoryPort {
  applyRescueReturnTransition(input: RoutingRescueReturnApplyInput): MaybePromise<RoutingRescueReturnApplyResult>;
  applySlaTimerTransition(input: RoutingSlaTimerApplyInput): MaybePromise<RoutingSlaTimerApplyResult>;
  claimJob(input: RoutingJobClaimInput): MaybePromise<RoutingJobDescriptor | undefined>;
  findOperatorCapacity(capacityId: string, scope?: RoutingTenantScope): MaybePromise<OperatorCapacityRecord | undefined>;
  findOperatorCapacityByOperatorChannel(tenantId: string, operatorId: string, channel: string): MaybePromise<OperatorCapacityRecord | undefined>;
  findQueueMembership(membershipId: string, scope?: RoutingTenantScope): MaybePromise<QueueMembershipRecord | undefined>;
  findRoutingRule(ruleId: string, scope?: RoutingTenantScope): MaybePromise<RoutingRuleRecord | undefined>;
  findRoutingRuleByChannel(tenantId: string, channel: string): MaybePromise<RoutingRuleRecord | undefined>;
  hydrateStateSnapshot(): MaybePromise<RoutingState>;
  listJobs(): MaybePromise<RoutingJobDescriptor[]>;
  listOperatorCapacities(filters?: OperatorCapacityFilters): OperatorCapacityRecord[] | Promise<OperatorCapacityRecord[]>;
  listQueueMemberships(filters?: QueueMembershipFilters): QueueMembershipRecord[] | Promise<QueueMembershipRecord[]>;
  listRoutingAnalyticsRows(filters?: RoutingAnalyticsFilters): RoutingAnalyticsRow[] | Promise<RoutingAnalyticsRow[]>;
  listRoutingRules(filters?: RoutingRuleFilters): RoutingRuleRecord[] | Promise<RoutingRuleRecord[]>;
  readState(): RoutingState;
  saveJob(job: RoutingJobDescriptor): MaybePromise<RoutingJobDescriptor>;
  saveOperatorCapacity(capacity: OperatorCapacityRecord): OperatorCapacityRecord | Promise<OperatorCapacityRecord>;
  saveQueueMembership(membership: QueueMembershipRecord): QueueMembershipRecord | Promise<QueueMembershipRecord>;
  saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow | Promise<RoutingAnalyticsRow>;
  saveRoutingRule(rule: RoutingRuleRecord): RoutingRuleRecord | Promise<RoutingRuleRecord>;
  saveState(state: RoutingState): MaybePromise<RoutingState>;
}

export interface PrismaRoutingClient {
  $transaction?<T>(callback: (client: PrismaRoutingClient) => Promise<T>): Promise<T>;
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
  routingJob: {
    findUnique(input: { where: { id: string } }): Promise<PrismaRoutingJobRow | null>;
    findMany(input: { orderBy: { updatedAt: "desc" } }): Promise<PrismaRoutingJobRow[]>;
    updateMany(input: {
      data: PrismaRoutingJobUpdateInput;
      where: PrismaRoutingJobWhereInput;
    }): Promise<{ count: number }>;
    upsert(input: {
      create: PrismaRoutingJobCreateInput;
      update: PrismaRoutingJobUpdateInput;
      where: { id: string };
    }): Promise<PrismaRoutingJobRow>;
  };
  routingStateSnapshot: {
    create(input: { data: PrismaRoutingStateSnapshotCreateInput }): Promise<PrismaRoutingStateSnapshotRow>;
    findUnique(input: { where: { id: string } }): Promise<PrismaRoutingStateSnapshotRow | null>;
    updateMany(input: {
      data: PrismaRoutingStateSnapshotUpdateInput;
      where: { id: string; version: number };
    }): Promise<{ count: number }>;
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

interface PrismaRoutingJobWhereInput {
  id: string;
  queue: string;
  status: string | null;
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

interface PrismaRoutingJobRow {
  action: string | null;
  conversationId: string | null;
  createdAt?: Date;
  id: string;
  kind: string | null;
  payload: RoutingJobDescriptor;
  queue: string;
  redistributionId: string | null;
  runAt: number | string | null;
  status: string | null;
  updatedAt: Date;
}

interface PrismaRoutingStateSnapshotRow {
  conversations: unknown;
  id: string;
  operators: unknown;
  queues: unknown;
  rescueReportRows: unknown;
  updatedAt: Date;
  version: number;
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

interface PrismaRoutingJobCreateInput {
  action: string | null;
  conversationId: string | null;
  id: string;
  kind: string | null;
  payload: RoutingJobDescriptor;
  queue: string;
  redistributionId: string | null;
  runAt: number | string | typeof Prisma.DbNull;
  status: string | null;
}

type PrismaRoutingJobUpdateInput = Omit<PrismaRoutingJobCreateInput, "id">;

interface PrismaRoutingStateSnapshotCreateInput {
  conversations: RoutingConversation[];
  id: string;
  operators: RoutingOperator[];
  queues: RoutingQueue[];
  rescueReportRows: RescueReportRow[];
  version: number;
}

type PrismaRoutingStateSnapshotUpdateInput = Omit<PrismaRoutingStateSnapshotCreateInput, "id">;

let defaultRepository: RoutingRepository | null = null;

export class RoutingRepository implements RoutingRepositoryPort {
  private constructor(private readonly adapter: RoutingRepositoryPort) {}

  static default(): RoutingRepository {
    if (defaultRepository) {
      return defaultRepository;
    }

    if (isLocalRuntime()) {
      defaultRepository = RoutingRepository.inMemory(bootstrapRoutingState());
      return defaultRepository;
    }

    defaultRepository = RoutingRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: RoutingRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed?: Partial<RoutingState>): RoutingRepository {
    const resolved = seed ?? (isLocalRuntime() ? bootstrapRoutingState() : seedRoutingState());
    return new RoutingRepository(createDurableRoutingRepository(new InMemoryStore(normalizeState(resolved))));
  }

  static open({ filePath, seed }: RoutingRepositoryOptions): RoutingRepository {
    const resolved = seed ?? (isLocalRuntime() ? bootstrapRoutingState() : seedRoutingState());
    return new RoutingRepository(createDurableRoutingRepository(new JsonFileStore({ filePath, seed: normalizeState(resolved) })));
  }

  static prisma({ client, fallback }: PrismaRoutingRepositoryOptions): RoutingRepository {
    return new RoutingRepository(new PrismaRoutingRepository(client, fallback));
  }

  applyRescueReturnTransition(input: RoutingRescueReturnApplyInput): MaybePromise<RoutingRescueReturnApplyResult> {
    return this.adapter.applyRescueReturnTransition(input);
  }

  applySlaTimerTransition(input: RoutingSlaTimerApplyInput): MaybePromise<RoutingSlaTimerApplyResult> {
    return this.adapter.applySlaTimerTransition(input);
  }

  claimJob(input: RoutingJobClaimInput): MaybePromise<RoutingJobDescriptor | undefined> {
    return this.adapter.claimJob(input);
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

  hydrateStateSnapshot(): MaybePromise<RoutingState> {
    return this.adapter.hydrateStateSnapshot();
  }

  listJobs(): MaybePromise<RoutingJobDescriptor[]> {
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

  saveJob(job: RoutingJobDescriptor): MaybePromise<RoutingJobDescriptor> {
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

  saveState(state: RoutingState): MaybePromise<RoutingState> {
    return this.adapter.saveState(state);
  }
}

class PrismaRoutingRepository implements RoutingRepositoryPort {
  private stateCache: RoutingState;
  private stateSnapshotVersion = 0;

  constructor(private readonly client: PrismaRoutingClient, _fallback?: RoutingRepositoryPort) {
    void _fallback;
    this.stateCache = seedRoutingState();
  }

  async applyRescueReturnTransition(input: RoutingRescueReturnApplyInput): Promise<RoutingRescueReturnApplyResult> {
    const result = await this.withRoutingTransaction(async (client) => {
      const row = await client.routingJob.findUnique({ where: { id: input.jobId } });
      const currentJob = row ? toRoutingJobDescriptor(row) : undefined;
      const conversationId = typeof (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId === "string"
        ? (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId!
        : null;
      if (!currentJob) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
      }
      if (currentJob.queue !== "rescue-return") {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "unsupported_queue") };
      }
      if (currentJob.action !== "return_to_sla_queue") {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "unsupported_action") };
      }
      if (!conversationId) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "missing_conversation_id") };
      }
      if (currentJob.status !== "claimed") {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
      }

      const snapshot = await this.readCurrentStateSnapshot(client);
      const conversation = snapshot.state.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "conversation_not_found") };
      }
      if (conversation.rescue?.state !== "active") {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "not_active_rescue") };
      }

      const previousOperatorId = conversation.operatorId ?? null;
      const rescue = conversation.rescue;
      const tenantContext = resolveRescueReturnTenantContext(input, conversation);
      if ("reason" in tenantContext) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, tenantContext.reason) };
      }
      const tenantId = tenantContext.tenantId;
      const completedJob = {
        ...currentJob,
        completedAt: input.completedAt,
        status: "completed"
      };
      const analyticsRow: RoutingAnalyticsRow = {
        channel: conversation.channel,
        conversationId,
        eventKind: "auto_return",
        fromOperatorId: previousOperatorId,
        id: `analytics_auto_return_${input.jobId}`,
        occurredAt: input.completedAt,
        source: "rescue-return-worker",
        tenantId,
        toOperatorId: null
      };
      const nextState = normalizeState({
        ...snapshot.state,
        conversations: snapshot.state.conversations.map((item) => item.id === conversationId
          ? {
              ...item,
              operatorId: undefined,
              rescue: {
                ...item.rescue!,
                state: "returned_to_queue" as const
              },
              slaTone: "hold" as const,
              status: "queued" as const
            }
          : item),
        operators: snapshot.state.operators.map((operator) => operator.id === previousOperatorId && operator.tenantId === tenantId
          ? {
              ...operator,
              chats: Math.max(0, operator.chats - 1),
              rescueActive: Math.max(0, operator.rescueActive - 1)
            }
          : operator),
        queues: snapshot.state.queues.map((queue) => queue.channel === conversation.channel && queue.tenantId === tenantId
          ? {
              ...queue,
              active: Math.max(0, queue.active - 1),
              waiting: queue.waiting + 1
            }
          : queue),
        rescueReportRows: [
          ...snapshot.state.rescueReportRows,
          {
            channel: conversation.channel,
            conversationId,
            digest: "daily_rescue",
            operatorId: previousOperatorId,
            outcome: "returned_to_queue",
            reason: rescue.reason,
            resolution: "Auto-returned to SLA queue after rescue timer expired",
            tenantId,
            timerSeconds: rescue.durationSeconds
          }
        ]
      });

      const jobCreate = toPrismaRoutingJobCreateInput(completedJob);
      const jobUpdate = await client.routingJob.updateMany({
        data: toPrismaRoutingJobUpdateInput(jobCreate),
        where: { id: input.jobId, queue: "rescue-return", status: "claimed" }
      });
      if (jobUpdate.count !== 1) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
      }
      const analyticsCreate = toPrismaRoutingAnalyticsCreateInput(analyticsRow);
      const persistedAnalytics = await client.routingAnalyticsRow.upsert({
        create: analyticsCreate,
        update: toPrismaRoutingAnalyticsUpdateInput(analyticsCreate),
        where: { id: analyticsRow.id }
      });
      const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
      const outcome = appliedRescueReturn(input, conversation, previousOperatorId);
      return {
        analyticsRow: toRoutingAnalyticsRow(persistedAnalytics),
        completedJob,
        nextState,
        nextVersion,
        outcome
      };
    });

    if (result.completedJob && result.nextState && result.nextVersion !== undefined) {
      this.stateSnapshotVersion = result.nextVersion;
      this.stateCache = normalizeState({
        ...this.stateCache,
        ...result.nextState,
        jobs: upsertById(this.stateCache.jobs, result.completedJob),
        routingAnalyticsRows: result.analyticsRow
          ? upsertById(this.stateCache.routingAnalyticsRows, result.analyticsRow)
          : this.stateCache.routingAnalyticsRows
      });
    }
    return clone(result.outcome);
  }

  async applySlaTimerTransition(input: RoutingSlaTimerApplyInput): Promise<RoutingSlaTimerApplyResult> {
    const result = await this.withRoutingTransaction(async (client) => {
      const row = await client.routingJob.findUnique({ where: { id: input.jobId } });
      const currentJob = row ? toRoutingJobDescriptor(row) : undefined;
      if (!currentJob || currentJob.status !== "claimed") {
        return { outcome: skippedSlaTimer(input, "job_not_claimed") };
      }
      if (currentJob.queue !== "sla-timers") {
        return { outcome: skippedSlaTimer(input, "unsupported_queue") };
      }
      if (currentJob.action !== input.action) {
        return { outcome: skippedSlaTimer(input, "unsupported_action") };
      }
      if (typeof currentJob.conversationId === "string" && currentJob.conversationId !== input.conversationId) {
        return { outcome: skippedSlaTimer(input, "conversation_mismatch") };
      }

      const snapshot = await this.readCurrentStateSnapshot(client);
      const conversationId = typeof currentJob.conversationId === "string" ? currentJob.conversationId : input.conversationId;
      const conversation = snapshot.state.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return { outcome: skippedSlaTimer({ ...input, conversationId }, "conversation_not_found") };
      }
      if (input.action === "resume_sla" && conversation.status !== "paused") {
        return { outcome: skippedSlaTimer({ ...input, conversationId }, "not_paused") };
      }
      if (input.action === "mark_sla_overdue" && conversation.status !== "active" && conversation.status !== "assigned") {
        return { outcome: skippedSlaTimer({ ...input, conversationId }, "not_active") };
      }
      const nextState = normalizeState({
        ...snapshot.state,
        conversations: snapshot.state.conversations.map((conversation) => conversation.id === conversationId
          ? {
              ...conversation,
              slaTone: input.action === "resume_sla" ? "ok" as const : input.toSlaTone ?? "danger",
              status: input.toStatus
            }
          : conversation)
      });
      const completedJob = {
        ...currentJob,
        completedAt: input.completedAt,
        status: "completed"
      };
      const jobCreate = toPrismaRoutingJobCreateInput(completedJob);
      const jobUpdate = await client.routingJob.updateMany({
        data: toPrismaRoutingJobUpdateInput(jobCreate),
        where: { id: input.jobId, queue: "sla-timers", status: "claimed" }
      });
      if (jobUpdate.count !== 1) {
        return { outcome: skippedSlaTimer(input, "job_not_claimed") };
      }
      const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
      const appliedInput = { ...input, conversationId };
      return {
        completedJob,
        nextState,
        nextVersion,
        outcome: appliedSlaTimer(appliedInput)
      };
    });

    if (result.completedJob && result.nextState && result.nextVersion !== undefined) {
      this.stateSnapshotVersion = result.nextVersion;
      this.stateCache = normalizeState({
        ...this.stateCache,
        ...result.nextState,
        jobs: upsertById(this.stateCache.jobs, result.completedJob)
      });
    }
    return clone(result.outcome);
  }

  async claimJob(input: RoutingJobClaimInput): Promise<RoutingJobDescriptor | undefined> {
    const row = await this.client.routingJob.findUnique({ where: { id: input.jobId } });
    const current = row ? toRoutingJobDescriptor(row) : undefined;
    if (!current || current.queue !== input.queue || (current.status ?? null) !== input.expectedStatus) {
      return undefined;
    }

    const claimed = {
      ...current,
      claimedAt: input.claimedAt,
      completedAt: undefined,
      status: "claimed"
    };
    const create = toPrismaRoutingJobCreateInput(claimed);
    const result = await this.client.routingJob.updateMany({
      data: toPrismaRoutingJobUpdateInput(create),
      where: {
        id: input.jobId,
        queue: input.queue,
        status: input.expectedStatus
      }
    });
    if (result.count !== 1) {
      return undefined;
    }

    this.stateCache = normalizeState({
      ...this.stateCache,
      jobs: upsertById(this.stateCache.jobs, claimed)
    });
    return clone(claimed);
  }

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

  async hydrateStateSnapshot(): Promise<RoutingState> {
    let snapshot = await this.client.routingStateSnapshot.findUnique({
      where: { id: ROUTING_STATE_SNAPSHOT_ID }
    });
    if (!snapshot) {
      snapshot = await this.client.routingStateSnapshot.create({
        data: toPrismaRoutingStateSnapshotCreateInput(seedRoutingState())
      });
    }
    this.stateSnapshotVersion = snapshot.version;
    const snapshotState = toRoutingStateFromSnapshot(snapshot, seedRoutingState());
    this.stateCache = normalizeState({
      ...snapshotState,
      jobs: await this.listJobs(),
      operatorCapacities: await this.listOperatorCapacities(),
      queueMemberships: await this.listQueueMemberships(),
      routingAnalyticsRows: await this.listRoutingAnalyticsRows(),
      routingRules: await this.listRoutingRules()
    });

    return clone(this.stateCache);
  }

  async listJobs(): Promise<RoutingJobDescriptor[]> {
    const rows = await this.client.routingJob.findMany({
      orderBy: { updatedAt: "desc" }
    });

    return rows.map(toRoutingJobDescriptor);
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
    return clone(this.stateCache);
  }

  async saveJob(job: RoutingJobDescriptor): Promise<RoutingJobDescriptor> {
    const create = toPrismaRoutingJobCreateInput(job);
    const row = await this.client.routingJob.upsert({
      create,
      update: toPrismaRoutingJobUpdateInput(create),
      where: { id: create.id }
    });

    const persisted = toRoutingJobDescriptor(row);
    this.stateCache = normalizeState({
      ...this.stateCache,
      jobs: upsertById(this.stateCache.jobs, persisted)
    });
    return persisted;
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

    const persisted = toOperatorCapacityRecord(row);
    this.stateCache = normalizeState({
      ...this.stateCache,
      operatorCapacities: upsertById(this.stateCache.operatorCapacities, persisted)
    });
    return persisted;
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

    const persisted = toQueueMembershipRecord(row);
    this.stateCache = normalizeState({
      ...this.stateCache,
      queueMemberships: upsertById(this.stateCache.queueMemberships, persisted)
    });
    return persisted;
  }

  async saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): Promise<RoutingAnalyticsRow> {
    const create = toPrismaRoutingAnalyticsCreateInput(row);
    const persisted = await this.client.routingAnalyticsRow.upsert({
      create,
      update: toPrismaRoutingAnalyticsUpdateInput(create),
      where: { id: row.id }
    });

    const normalized = toRoutingAnalyticsRow(persisted);
    this.stateCache = normalizeState({
      ...this.stateCache,
      routingAnalyticsRows: upsertById(this.stateCache.routingAnalyticsRows, normalized)
    });
    return normalized;
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

    const persisted = toRoutingRuleRecord(row);
    this.stateCache = normalizeState({
      ...this.stateCache,
      routingRules: upsertById(this.stateCache.routingRules, persisted)
    });
    return persisted;
  }

  async saveState(state: RoutingState): Promise<RoutingState> {
    const normalized = normalizeState(state);
    await this.assertStateNaturalKeys(normalized);
    this.stateSnapshotVersion = await this.saveStateSnapshot(normalized);
    await this.saveStateSideTables(normalized);
    return clone(this.stateCache);
  }

  private async assertStateNaturalKeys(state: RoutingState): Promise<void> {
    for (const capacity of state.operatorCapacities) {
      assertNaturalKeyAvailable(state.operatorCapacities, capacity, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
      const existing = await this.findOperatorCapacityByOperatorChannel(capacity.tenantId, capacity.operatorId, capacity.channel);
      assertNaturalKeyAvailable(existing ? [existing] : [], capacity, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
    }
    for (const membership of state.queueMemberships) {
      assertNaturalKeyAvailable(state.queueMemberships, membership, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
      const existing = await this.listQueueMemberships({
        operatorId: membership.operatorId,
        queueId: membership.queueId,
        tenantId: membership.tenantId
      });
      assertNaturalKeyAvailable(existing, membership, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
    }
    for (const rule of state.routingRules) {
      assertNaturalKeyAvailable(state.routingRules, rule, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
      const existing = await this.client.routingRule.findFirst({
        where: { channel: rule.channel, tenantId: rule.tenantId }
      });
      assertNaturalKeyAvailable(existing ? [toRoutingRuleRecord(existing)] : [], rule, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
    }
  }

  private async saveStateSideTables(state: RoutingState): Promise<void> {
    const persistedJobs: RoutingJobDescriptor[] = [];
    const persistedOperatorCapacities: OperatorCapacityRecord[] = [];
    const persistedQueueMemberships: QueueMembershipRecord[] = [];
    const persistedRoutingAnalyticsRows: RoutingAnalyticsRow[] = [];
    const persistedRoutingRules: RoutingRuleRecord[] = [];

    for (const job of state.jobs) {
      const create = toPrismaRoutingJobCreateInput(job);
      const row = await this.client.routingJob.upsert({
        create,
        update: toPrismaRoutingJobUpdateInput(create),
        where: { id: create.id }
      });
      persistedJobs.push(toRoutingJobDescriptor(row));
    }
    for (const capacity of state.operatorCapacities) {
      const create = toPrismaOperatorCapacityCreateInput(capacity);
      const row = await this.client.operatorCapacity.upsert({
        create,
        update: toPrismaOperatorCapacityUpdateInput(create),
        where: { id: capacity.id }
      });
      persistedOperatorCapacities.push(toOperatorCapacityRecord(row));
    }
    for (const membership of state.queueMemberships) {
      const create = toPrismaQueueMembershipCreateInput(membership);
      const row = await this.client.queueMembership.upsert({
        create,
        update: toPrismaQueueMembershipUpdateInput(create),
        where: { id: membership.id }
      });
      persistedQueueMemberships.push(toQueueMembershipRecord(row));
    }
    for (const row of state.routingAnalyticsRows) {
      const create = toPrismaRoutingAnalyticsCreateInput(row);
      const persisted = await this.client.routingAnalyticsRow.upsert({
        create,
        update: toPrismaRoutingAnalyticsUpdateInput(create),
        where: { id: row.id }
      });
      persistedRoutingAnalyticsRows.push(toRoutingAnalyticsRow(persisted));
    }
    for (const rule of state.routingRules) {
      const create = toPrismaRoutingRuleCreateInput(rule);
      const row = await this.client.routingRule.upsert({
        create,
        update: toPrismaRoutingRuleUpdateInput(create),
        where: { id: rule.id }
      });
      persistedRoutingRules.push(toRoutingRuleRecord(row));
    }

    this.stateCache = normalizeState({
      ...state,
      jobs: persistedJobs,
      operatorCapacities: persistedOperatorCapacities,
      queueMemberships: persistedQueueMemberships,
      routingAnalyticsRows: persistedRoutingAnalyticsRows,
      routingRules: persistedRoutingRules
    });
  }

  private async readCurrentStateSnapshot(client: PrismaRoutingClient = this.client): Promise<{ state: RoutingState; version: number }> {
    let snapshot = await client.routingStateSnapshot.findUnique({
      where: { id: ROUTING_STATE_SNAPSHOT_ID }
    });
    if (!snapshot) {
      snapshot = await client.routingStateSnapshot.create({
        data: toPrismaRoutingStateSnapshotCreateInput(seedRoutingState())
      });
    }
    return {
      state: toRoutingStateFromSnapshot(snapshot, seedRoutingState()),
      version: snapshot.version
    };
  }

  private async saveStateSnapshot(state: RoutingState, client: PrismaRoutingClient = this.client, expectedVersion = this.stateSnapshotVersion): Promise<number> {
    const create = {
      ...toPrismaRoutingStateSnapshotCreateInput(state),
      version: expectedVersion > 0 ? expectedVersion + 1 : 1
    };
    if (expectedVersion === 0) {
      const snapshot = await client.routingStateSnapshot.create({ data: create });
      return snapshot.version;
    } else {
      const result = await client.routingStateSnapshot.updateMany({
        data: toPrismaRoutingStateSnapshotUpdateInput(create),
        where: { id: ROUTING_STATE_SNAPSHOT_ID, version: expectedVersion }
      });
      if (result.count !== 1) {
        throw new Error("routing_state_snapshot_conflict");
      }
      return create.version;
    }
  }

  private async withRoutingTransaction<T>(operation: (client: PrismaRoutingClient) => Promise<T>): Promise<T> {
    return this.client.$transaction
      ? this.client.$transaction(operation)
      : operation(this.client);
  }
}

function createDurableRoutingRepository(store: DurableStore<RoutingState>): RoutingRepositoryPort {
  return {
    applyRescueReturnTransition(input: RoutingRescueReturnApplyInput): RoutingRescueReturnApplyResult {
      let outcome: RoutingRescueReturnApplyResult = skippedRescueReturn(input.jobId, input.fallbackConversationId ?? null, "job_not_claimed");
      store.update((state) => {
        const current = normalizeState(state);
        const currentJob = current.jobs.find((job) => job.id === input.jobId);
        const conversationId = typeof (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId === "string"
          ? (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId!
          : null;
        if (!currentJob) {
          outcome = skippedRescueReturn(input.jobId, conversationId, "job_not_claimed");
          return current;
        }
        if (currentJob.queue !== "rescue-return") {
          outcome = skippedRescueReturn(input.jobId, conversationId, "unsupported_queue");
          return current;
        }
        if (currentJob.action !== "return_to_sla_queue") {
          outcome = skippedRescueReturn(input.jobId, conversationId, "unsupported_action");
          return current;
        }
        if (!conversationId) {
          outcome = skippedRescueReturn(input.jobId, conversationId, "missing_conversation_id");
          return current;
        }
        if (currentJob.status !== "claimed") {
          outcome = skippedRescueReturn(input.jobId, conversationId, "job_not_claimed");
          return current;
        }

        const conversation = current.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          outcome = skippedRescueReturn(input.jobId, conversationId, "conversation_not_found");
          return current;
        }
        if (conversation.rescue?.state !== "active") {
          outcome = skippedRescueReturn(input.jobId, conversationId, "not_active_rescue");
          return current;
        }

        const previousOperatorId = conversation.operatorId ?? null;
        const rescue = conversation.rescue;
        const tenantContext = resolveRescueReturnTenantContext(input, conversation);
        if ("reason" in tenantContext) {
          outcome = skippedRescueReturn(input.jobId, conversationId, tenantContext.reason);
          return current;
        }
        const tenantId = tenantContext.tenantId;
        outcome = appliedRescueReturn(input, conversation, previousOperatorId);
        return {
          ...current,
          conversations: current.conversations.map((item) => item.id === conversationId
            ? {
                ...item,
                operatorId: undefined,
                rescue: {
                  ...item.rescue!,
                  state: "returned_to_queue" as const
                },
                slaTone: "hold" as const,
                status: "queued" as const
              }
            : item),
          jobs: current.jobs.map((job) => job.id === input.jobId
            ? {
                ...job,
                completedAt: input.completedAt,
                status: "completed"
              }
            : job),
          operators: current.operators.map((operator) => operator.id === previousOperatorId && operator.tenantId === tenantId
            ? {
                ...operator,
                chats: Math.max(0, operator.chats - 1),
                rescueActive: Math.max(0, operator.rescueActive - 1)
              }
            : operator),
          queues: current.queues.map((queue) => queue.channel === conversation.channel && queue.tenantId === tenantId
            ? {
                ...queue,
                active: Math.max(0, queue.active - 1),
                waiting: queue.waiting + 1
              }
            : queue),
          rescueReportRows: [
            ...current.rescueReportRows,
            {
              channel: conversation.channel,
              conversationId,
              digest: "daily_rescue",
              operatorId: previousOperatorId,
              outcome: "returned_to_queue",
              reason: rescue.reason,
              resolution: "Auto-returned to SLA queue after rescue timer expired",
              tenantId,
              timerSeconds: rescue.durationSeconds
            }
          ],
          routingAnalyticsRows: [
            ...current.routingAnalyticsRows,
            {
              channel: conversation.channel,
              conversationId,
              eventKind: "auto_return",
              fromOperatorId: previousOperatorId,
              id: `analytics_auto_return_${input.jobId}`,
              occurredAt: input.completedAt,
              source: "rescue-return-worker",
              tenantId,
              toOperatorId: null
            }
          ]
        };
      });

      return clone(outcome);
    },

    applySlaTimerTransition(input: RoutingSlaTimerApplyInput): RoutingSlaTimerApplyResult {
      let outcome: RoutingSlaTimerApplyResult = skippedSlaTimer(input, "job_not_claimed");
      store.update((state) => {
        const current = normalizeState(state);
        const currentJob = current.jobs.find((job) => job.id === input.jobId);
        if (!currentJob || currentJob.status !== "claimed") {
          outcome = skippedSlaTimer(input, "job_not_claimed");
          return current;
        }
        if (currentJob.queue !== "sla-timers") {
          outcome = skippedSlaTimer(input, "unsupported_queue");
          return current;
        }
        if (currentJob.action !== input.action) {
          outcome = skippedSlaTimer(input, "unsupported_action");
          return current;
        }
        if (typeof currentJob.conversationId === "string" && currentJob.conversationId !== input.conversationId) {
          outcome = skippedSlaTimer(input, "conversation_mismatch");
          return current;
        }

        const conversationId = typeof currentJob.conversationId === "string" ? currentJob.conversationId : input.conversationId;
        const conversation = current.conversations.find((item) => item.id === conversationId);
        if (!conversation) {
          outcome = skippedSlaTimer({ ...input, conversationId }, "conversation_not_found");
          return current;
        }
        if (input.action === "resume_sla" && conversation.status !== "paused") {
          outcome = skippedSlaTimer({ ...input, conversationId }, "not_paused");
          return current;
        }
        if (input.action === "mark_sla_overdue" && conversation.status !== "active" && conversation.status !== "assigned") {
          outcome = skippedSlaTimer({ ...input, conversationId }, "not_active");
          return current;
        }

        outcome = appliedSlaTimer({ ...input, conversationId });
        return {
          ...current,
          conversations: current.conversations.map((conversation) => conversation.id === conversationId
            ? {
                ...conversation,
                slaTone: input.action === "resume_sla" ? "ok" as const : input.toSlaTone ?? "danger",
                status: input.toStatus
              }
            : conversation),
          jobs: current.jobs.map((job) => job.id === input.jobId
            ? {
                ...job,
                completedAt: input.completedAt,
                status: "completed"
              }
            : job)
        };
      });

      return clone(outcome);
    },

    claimJob(input: RoutingJobClaimInput): RoutingJobDescriptor | undefined {
      let persisted: RoutingJobDescriptor | undefined;
      store.update((state) => {
        const current = normalizeState(state);
        const job = current.jobs.find((item) => item.id === input.jobId);
        if (!job || job.queue !== input.queue || (job.status ?? null) !== input.expectedStatus) {
          return current;
        }

        persisted = {
          ...job,
          claimedAt: input.claimedAt,
          completedAt: undefined,
          status: "claimed"
        };
        return {
          ...current,
          jobs: current.jobs.map((item) => item.id === input.jobId ? persisted! : item)
        };
      });

      return persisted ? clone(persisted) : undefined;
    },

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

    hydrateStateSnapshot(): RoutingState {
      return clone(readState(store));
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

function appliedSlaTimer(input: RoutingSlaTimerApplyInput): RoutingSlaTimerApplyResult {
  return {
    conversationId: input.conversationId,
    jobId: input.jobId,
    ...(input.action === "mark_sla_overdue"
      ? {
          overdueDescriptor: {
            conversationId: input.conversationId,
            jobId: input.jobId,
            kind: "sla.timer.overdue" as const,
            occurredAt: input.completedAt,
            queue: "sla-timers" as const
          },
          realtimeEvent: {
            data: {
              jobId: input.jobId,
              state: "overdue" as const
            },
            occurredAt: input.completedAt,
            resourceId: input.conversationId,
            resourceType: "conversation" as const,
            type: "sla.timer.updated" as const
          }
        }
      : {}),
    status: "applied"
  };
}

function skippedSlaTimer(input: RoutingSlaTimerApplyInput, reason: NonNullable<RoutingSlaTimerApplyResult["reason"]>): RoutingSlaTimerApplyResult {
  return {
    conversationId: input.conversationId,
    jobId: input.jobId,
    reason,
    status: "skipped"
  };
}

function appliedRescueReturn(
  input: RoutingRescueReturnApplyInput,
  conversation: RoutingConversation,
  previousOperatorId: string | null
): RoutingRescueReturnApplyResult {
  return {
    analyticsDescriptor: {
      channel: conversation.channel,
      conversationId: conversation.id,
      jobId: input.jobId,
      kind: "routing.rescue.auto_returned",
      occurredAt: input.completedAt,
      operatorId: previousOperatorId
    },
    conversationId: conversation.id,
    jobId: input.jobId,
    realtimeEvent: {
      data: {
        jobId: input.jobId,
        state: "returned_to_queue"
      },
      occurredAt: input.completedAt,
      resourceId: conversation.id,
      resourceType: "conversation",
      type: "rescue.countdown.updated"
    },
    status: "applied"
  };
}

function skippedRescueReturn(
  jobId: string,
  conversationId: string | null,
  reason: NonNullable<RoutingRescueReturnApplyResult["reason"]>
): RoutingRescueReturnApplyResult {
  return {
    conversationId,
    jobId,
    reason,
    status: "skipped"
  };
}

function resolveRescueReturnTenantContext(
  input: RoutingRescueReturnApplyInput,
  conversation: RoutingConversation
): { tenantId: string } | { reason: "tenant_context_mismatch" | "tenant_context_required" } {
  const inputTenantId = normalizeTenantId(input.tenantId);
  const conversationTenantId = normalizeTenantId(conversation.tenantId);

  if (inputTenantId && conversationTenantId && inputTenantId !== conversationTenantId) {
    return { reason: "tenant_context_mismatch" };
  }

  const tenantId = inputTenantId ?? conversationTenantId;
  return tenantId ? { tenantId } : { reason: "tenant_context_required" };
}

function normalizeTenantId(value?: string | null): string | null {
  const tenantId = String(value ?? "").trim();
  return tenantId || null;
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

function toRoutingJobDescriptor(row: PrismaRoutingJobRow): RoutingJobDescriptor {
  const payload = clone(row.payload ?? {}) as RoutingJobDescriptor;
  return {
    ...payload,
    ...(row.action !== null ? { action: row.action } : {}),
    ...(row.conversationId !== null ? { conversationId: row.conversationId } : {}),
    id: row.id,
    ...(row.kind !== null ? { kind: row.kind } : {}),
    queue: row.queue,
    ...(row.redistributionId !== null ? { redistributionId: row.redistributionId } : {}),
    ...(row.runAt !== null ? { runAt: row.runAt } : {}),
    ...(row.status !== null ? { status: row.status } : {})
  };
}

function toRoutingStateFromSnapshot(row: PrismaRoutingStateSnapshotRow, base: RoutingState): RoutingState {
  return normalizeState({
    ...base,
    conversations: jsonArray<RoutingConversation>(row.conversations, base.conversations),
    operators: jsonArray<RoutingOperator>(row.operators, base.operators),
    queues: jsonArray<RoutingQueue>(row.queues, base.queues),
    rescueReportRows: jsonArray<RescueReportRow>(row.rescueReportRows, base.rescueReportRows)
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

function toPrismaRoutingJobCreateInput(job: RoutingJobDescriptor): PrismaRoutingJobCreateInput {
  return {
    action: typeof job.action === "string" ? job.action : null,
    conversationId: typeof job.conversationId === "string" ? job.conversationId : null,
    id: job.id,
    kind: typeof job.kind === "string" ? job.kind : null,
    payload: clone(job),
    queue: job.queue,
    redistributionId: typeof job.redistributionId === "string" ? job.redistributionId : null,
    runAt: typeof job.runAt === "number" || typeof job.runAt === "string" ? job.runAt : Prisma.DbNull,
    status: typeof job.status === "string" ? job.status : null
  };
}

function toPrismaRoutingJobUpdateInput(create: PrismaRoutingJobCreateInput): PrismaRoutingJobUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function toPrismaRoutingStateSnapshotCreateInput(state: RoutingState): PrismaRoutingStateSnapshotCreateInput {
  const normalized = normalizeState(state);
  return {
    conversations: clone(normalized.conversations),
    id: ROUTING_STATE_SNAPSHOT_ID,
    operators: clone(normalized.operators),
    queues: clone(normalized.queues),
    rescueReportRows: clone(normalized.rescueReportRows),
    version: 1
  };
}

function toPrismaRoutingStateSnapshotUpdateInput(create: PrismaRoutingStateSnapshotCreateInput): PrismaRoutingStateSnapshotUpdateInput {
  const { id: _id, ...update } = create;
  return update;
}

function upsertById<T extends { id: string }>(records: T[], record: T): T[] {
  return records.some((item) => item.id === record.id)
    ? records.map((item) => item.id === record.id ? record : item)
    : [...records, record];
}

function jsonArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? clone(value as T[]) : clone(fallback);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
