import { type DurableStore, InMemoryStore } from "@support-communication/database";
import { Prisma } from "@prisma/client";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue } from "./routing.types.js";

export type RoutingLimitMode = "operator_channel_limit" | "queue_round_robin";
export type RoutingPriorityStrategy = "least_loaded" | "round_robin" | "skill_match";
export type QueueMembershipRole = "backup" | "member" | "observer" | "primary";
export type RoutingAnalyticsEventKind = "assignment" | "auto_return" | "rescue" | "transfer";
const ROUTING_STATE_SNAPSHOT_ID = "default";

export interface RoutingLifecycleEvent {
  actorId: string | null;
  actorName: string | null;
  actorType: "operator" | "service_admin" | "system" | "worker";
  conversationId: string;
  data: Record<string, unknown>;
  eventType: string;
  id: string;
  ingestedAt: string;
  occurredAt: string;
  reason: string | null;
  schemaVersion: "conversation-lifecycle/v1";
  source: string;
  sourceEventId: string;
  tenantId: string;
  traceId: string;
}

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
  leaseExpiresAt?: string;
  leaseOwner?: string;
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
  expectedLeaseExpiresAt?: string | null;
  expectedLeaseOwner?: string | null;
  expectedStatus: string | null;
  jobId: string;
  leaseDurationMs?: number;
  queue: string;
  workerId?: string;
}

export interface RoutingSlaTimerApplyInput {
  action: "mark_sla_overdue" | "resume_sla";
  completedAt: string;
  conversationId: string;
  jobId: string;
  leaseOwner?: string;
  tenantId?: string;
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
  reason?: "conversation_mismatch" | "conversation_not_found" | "job_not_claimed" | "lease_lost" | "not_active" | "not_paused" | "tenant_context_mismatch" | "unsupported_action" | "unsupported_queue";
  status: "applied" | "skipped";
}

export interface RoutingRescueReturnApplyInput {
  completedAt: string;
  fallbackConversationId?: string | null;
  jobId: string;
  leaseOwner?: string;
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
  reason?: "conversation_not_found" | "job_not_claimed" | "lease_lost" | "missing_conversation_id" | "not_active_rescue" | "tenant_context_mismatch" | "tenant_context_required" | "unsupported_action" | "unsupported_queue";
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

export interface RoutingManualTransitionInput {
  action: "assign" | "pause_sla" | "resolve_rescue" | "return_queue" | "start_rescue" | "transfer";
  conversationId: string;
  expectedOperatorId: string | null;
  expectedStatus: string;
  expectedUpdatedAt?: string;
  lifecycleEvents: RoutingLifecycleEvent[];
  operatorName?: string | null;
  queueId?: string | null;
  realtimeEvent: RealtimeEvent;
  state: RoutingState;
  teamId?: string | null;
  tenantId: string;
}

export interface RoutingBatchTransitionInput {
  lifecycleEvents: RoutingLifecycleEvent[];
  realtimeEvents: RealtimeEvent[];
  state: RoutingState;
  tenantId: string;
  transitions: Array<{
    conversationId: string;
    expectedOperatorId: string | null;
    expectedStatus: string;
    operatorId: string;
    operatorName?: string | null;
    slaTone: string;
    status: string;
    teamId?: string | null;
  }>;
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
  saveBatchRoutingTransition(input: RoutingBatchTransitionInput): MaybePromise<RoutingState>;
  saveManualRoutingTransition(input: RoutingManualTransitionInput): MaybePromise<RoutingState>;
  saveOperatorCapacity(capacity: OperatorCapacityRecord): OperatorCapacityRecord | Promise<OperatorCapacityRecord>;
  saveQueueMembership(membership: QueueMembershipRecord): QueueMembershipRecord | Promise<QueueMembershipRecord>;
  saveRoutingAnalyticsRow(row: RoutingAnalyticsRow): RoutingAnalyticsRow | Promise<RoutingAnalyticsRow>;
  saveRoutingRule(rule: RoutingRuleRecord): RoutingRuleRecord | Promise<RoutingRuleRecord>;
  saveState(state: RoutingState): MaybePromise<RoutingState>;
  saveStateWithLifecycleEvents(state: RoutingState, events: RoutingLifecycleEvent[]): MaybePromise<RoutingState>;
}

export interface PrismaRoutingClient {
  $transaction?<T>(callback: (client: PrismaRoutingClient) => Promise<T>): Promise<T>;
  conversationLifecycleEvent: {
    create(input: { data: PrismaRoutingLifecycleEventCreateInput }): Promise<unknown>;
  };
  conversation?: {
    findUnique?(input: { where: { id: string } }): Promise<{
      id: string;
      operatorId: string | null;
      status: string;
      tenantId: string;
      updatedAt: Date;
    } | null>;
    updateMany(input: {
      data: PrismaRoutingConversationUpdateInput;
      where: PrismaRoutingConversationWhereInput;
    }): Promise<{ count: number }>;
  };
  conversationRealtimeEvent?: {
    create(input: { data: PrismaRoutingRealtimeEventCreateInput }): Promise<unknown>;
  };
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
    createMany?(input: { data: PrismaRoutingAnalyticsCreateInput[]; skipDuplicates: true }): Promise<{ count: number }>;
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

interface PrismaRoutingLifecycleEventCreateInput {
  actorId: string | null;
  actorName: string | null;
  actorType: string;
  conversationId: string;
  data: Prisma.InputJsonValue;
  eventType: string;
  id: string;
  ingestedAt: Date;
  occurredAt: Date;
  reason: string | null;
  schemaVersion: string;
  source: string;
  sourceEventId: string;
  tenantId: string;
  traceId: string;
}

interface PrismaRoutingConversationWhereInput {
  id: string;
  operatorId: string | null;
  status: string;
  tenantId: string;
  updatedAt?: Date;
}

interface PrismaRoutingConversationUpdateInput {
  operatorId: string | null;
  operatorName?: string | null;
  queueId?: string;
  rescueState?: Prisma.InputJsonValue | Prisma.NullTypes.JsonNull;
  slaTone: string;
  status: string;
  teamId?: string | null;
  updatedAt: Date;
}

interface PrismaRoutingRealtimeEventCreateInput {
  data: Prisma.InputJsonValue;
  eventId: string;
  eventName: string;
  id: string;
  occurredAt: Date;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
  tenantId: string;
  traceId: string;
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
  leaseExpiresAt?: Date | null;
  leaseOwner?: string | null;
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
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
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
  claimedAt: Date | null;
  conversationId: string | null;
  id: string;
  kind: string | null;
  leaseExpiresAt: Date | null;
  leaseOwner: string | null;
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
    const resolved = seed ?? seedRoutingState();
    return new RoutingRepository(createDurableRoutingRepository(new InMemoryStore(normalizeState(resolved))));
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

  saveBatchRoutingTransition(input: RoutingBatchTransitionInput): MaybePromise<RoutingState> {
    return this.adapter.saveBatchRoutingTransition(input);
  }

  saveManualRoutingTransition(input: RoutingManualTransitionInput): MaybePromise<RoutingState> {
    return this.adapter.saveManualRoutingTransition(input);
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

  saveStateWithLifecycleEvents(state: RoutingState, events: RoutingLifecycleEvent[]): MaybePromise<RoutingState> {
    return this.adapter.saveStateWithLifecycleEvents(state, events);
  }
}

class PrismaRoutingRepository implements RoutingRepositoryPort {
  private stateCache: RoutingState;

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
      if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "lease_lost") };
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
        leaseExpiresAt: undefined,
        leaseOwner: undefined,
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
        where: { id: input.jobId, leaseOwner: input.leaseOwner ?? null, queue: "rescue-return", status: "claimed" }
      });
      if (jobUpdate.count !== 1) {
        return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
      }
      if (client.conversation) {
        const canonicalUpdate = await client.conversation.updateMany({
          data: {
            operatorId: null,
            operatorName: null,
            rescueState: { ...rescue, state: "returned_to_queue" } as unknown as Prisma.InputJsonValue,
            slaTone: "hold",
            status: "queued",
            updatedAt: new Date(input.completedAt)
          },
          where: { id: conversationId, operatorId: previousOperatorId, status: conversation.status, tenantId }
        });
        if (canonicalUpdate.count !== 1) throw new Error(`routing_rescue_canonical_cas_conflict:${conversationId}`);
      }
      const analyticsCreate = toPrismaRoutingAnalyticsCreateInput(analyticsRow);
      const persistedAnalytics = await client.routingAnalyticsRow.upsert({
        create: analyticsCreate,
        update: toPrismaRoutingAnalyticsUpdateInput(analyticsCreate),
        where: { id: analyticsRow.id }
      });
      const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
      await appendLifecycleEvent(client, routingWorkerLifecycleEvent({
        action: "auto_return",
        completedAt: input.completedAt,
        conversationId,
        data: {
          fromOperatorId: previousOperatorId,
          fromStatus: conversation.status,
          jobId: input.jobId,
          toStatus: "queued"
        },
        eventType: "rescue.auto_returned",
        jobId: input.jobId,
        tenantId
      }));
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
      if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
        return { outcome: skippedSlaTimer(input, "lease_lost") };
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
      const tenantId = input.tenantId ?? conversation.tenantId;
      if (!tenantId || (input.tenantId && conversation.tenantId !== input.tenantId)) {
        return { outcome: skippedSlaTimer({ ...input, conversationId }, "tenant_context_mismatch") };
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
        leaseExpiresAt: undefined,
        leaseOwner: undefined,
        status: "completed"
      };
      const jobCreate = toPrismaRoutingJobCreateInput(completedJob);
      const jobUpdate = await client.routingJob.updateMany({
        data: toPrismaRoutingJobUpdateInput(jobCreate),
        where: { id: input.jobId, leaseOwner: input.leaseOwner ?? null, queue: "sla-timers", status: "claimed" }
      });
      if (jobUpdate.count !== 1) {
        return { outcome: skippedSlaTimer(input, "job_not_claimed") };
      }
      if (client.conversation) {
        const canonicalUpdate = await client.conversation.updateMany({
          data: {
            operatorId: conversation.operatorId ?? null,
            slaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
            status: input.toStatus,
            updatedAt: new Date(input.completedAt)
          },
          where: { id: conversationId, operatorId: conversation.operatorId ?? null, status: conversation.status, tenantId }
        });
        if (canonicalUpdate.count !== 1) throw new Error(`routing_sla_canonical_cas_conflict:${conversationId}`);
      }
      const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
      await appendLifecycleEvent(client, routingWorkerLifecycleEvent({
        action: input.action,
        completedAt: input.completedAt,
        conversationId,
        data: {
          fromSlaTone: conversation.slaTone,
          fromStatus: conversation.status,
          jobId: input.jobId,
          toSlaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
          toStatus: input.toStatus
        },
        eventType: input.action === "resume_sla" ? "sla.resumed" : "sla.overdue",
        jobId: input.jobId,
        tenantId
      }));
      const appliedInput = { ...input, conversationId };
      return {
        completedJob,
        nextState,
        nextVersion,
        outcome: appliedSlaTimer(appliedInput)
      };
    });

    if (result.completedJob && result.nextState && result.nextVersion !== undefined) {
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
    if (!current
      || current.queue !== input.queue
      || (current.status ?? null) !== input.expectedStatus
      || (current.leaseExpiresAt ?? null) !== (input.expectedLeaseExpiresAt ?? null)
      || (current.leaseOwner ?? null) !== (input.expectedLeaseOwner ?? null)) {
      return undefined;
    }

    const claimedAt = new Date(input.claimedAt);
    const leaseDurationMs = positiveLeaseDuration(input.leaseDurationMs);
    const claimed = {
      ...current,
      claimedAt: input.claimedAt,
      completedAt: undefined,
      leaseExpiresAt: new Date(claimedAt.getTime() + leaseDurationMs).toISOString(),
      leaseOwner: input.workerId?.trim() || `routing-worker:${process.pid}`,
      status: "claimed"
    };
    const create = toPrismaRoutingJobCreateInput(claimed);
    const result = await this.client.routingJob.updateMany({
      data: toPrismaRoutingJobUpdateInput(create),
      where: {
        id: input.jobId,
        leaseExpiresAt: input.expectedLeaseExpiresAt ? new Date(input.expectedLeaseExpiresAt) : null,
        leaseOwner: input.expectedLeaseOwner ?? null,
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

  async saveBatchRoutingTransition(input: RoutingBatchTransitionInput): Promise<RoutingState> {
    if (!this.client.$transaction || !this.client.conversation || !this.client.conversationRealtimeEvent) {
      throw new Error("prisma_batch_routing_delegates_required");
    }
    const normalized = normalizeState(input.state);
    if (!input.transitions.length || input.lifecycleEvents.length !== input.transitions.length || input.realtimeEvents.length !== input.transitions.length) {
      throw new Error("routing_batch_transition_invalid");
    }
    const result = await this.withRoutingTransaction(async (client) => {
      for (const transition of input.transitions) {
        const updated = await client.conversation!.updateMany({
          data: {
            operatorId: transition.operatorId,
            ...(transition.operatorName !== undefined ? { operatorName: transition.operatorName } : {}),
            slaTone: transition.slaTone,
            status: transition.status,
            ...(transition.teamId !== undefined ? { teamId: transition.teamId } : {}),
            updatedAt: new Date(input.realtimeEvents[0]!.occurredAt)
          },
          where: {
            id: transition.conversationId,
            operatorId: transition.expectedOperatorId,
            status: transition.expectedStatus,
            tenantId: input.tenantId
          }
        });
        if (updated.count !== 1) throw new Error(`routing_batch_conversation_cas_conflict:${transition.conversationId}`);
      }
      const nextVersion = await this.saveStateSnapshot(normalized, client);
      const persistedState = await this.saveStateSideTables(normalized, client, false);
      for (const event of input.lifecycleEvents) await appendLifecycleEvent(client, event);
      for (const event of input.realtimeEvents) await appendRealtimeEvent(client, event);
      return { nextVersion, persistedState };
    });
    this.stateCache = result.persistedState;
    return clone(this.stateCache);
  }

  async saveManualRoutingTransition(input: RoutingManualTransitionInput): Promise<RoutingState> {
    const conversationDelegate = this.client.conversation;
    const realtimeDelegate = this.client.conversationRealtimeEvent;
    if (!this.client.$transaction || !conversationDelegate || !realtimeDelegate) {
      throw new Error("prisma_manual_routing_delegates_required");
    }

    const normalized = normalizeState(input.state);
    const conversation = normalized.conversations.find((item) => item.id === input.conversationId && item.tenantId === input.tenantId);
    if (!conversation) {
      throw new Error("routing_manual_transition_conversation_missing");
    }
    assertManualTransitionEnvelope(input, conversation);

    const result = await this.withRoutingTransaction(async (client) => {
      const updated = await client.conversation!.updateMany({
        data: {
          operatorId: conversation.operatorId ?? null,
          ...(input.operatorName !== undefined ? { operatorName: input.operatorName } : {}),
          ...(input.queueId ? { queueId: input.queueId } : input.action === "return_queue" ? { queueId: conversation.channel } : {}),
          rescueState: conversation.rescue ? conversation.rescue as unknown as Prisma.InputJsonValue : Prisma.JsonNull,
          slaTone: conversation.slaTone,
          status: conversation.status,
          ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
          updatedAt: new Date(input.realtimeEvent.occurredAt)
        },
        where: {
          id: input.conversationId,
          operatorId: input.expectedOperatorId,
          status: input.expectedStatus,
          tenantId: input.tenantId,
          ...(input.expectedUpdatedAt ? { updatedAt: new Date(input.expectedUpdatedAt) } : {})
        }
      });
      if (updated.count !== 1) {
        const actual = client.conversation?.findUnique
          ? await client.conversation.findUnique({ where: { id: input.conversationId } })
          : null;
        throw new Error(`routing_conversation_cas_conflict:${JSON.stringify({
          actual: actual ? { operatorId: actual.operatorId, status: actual.status, tenantId: actual.tenantId, updatedAt: actual.updatedAt.toISOString() } : null,
          expected: { operatorId: input.expectedOperatorId, status: input.expectedStatus, tenantId: input.tenantId, updatedAt: input.expectedUpdatedAt ?? null },
          id: input.conversationId
        })}`);
      }

      const nextVersion = await this.saveStateSnapshot(normalized, client);
      const persistedState = await this.saveStateSideTables(normalized, client, false);
      for (const event of input.lifecycleEvents) {
        await appendLifecycleEvent(client, event);
      }
      await appendRealtimeEvent(client, input.realtimeEvent);
      return { nextVersion, persistedState };
    });

    this.stateCache = result.persistedState;
    return clone(this.stateCache);
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
    const persistedState = await this.withRoutingTransaction(async (client) => {
      await this.saveStateSnapshot(normalized, client);
      return this.saveStateSideTables(normalized, client, false);
    });
    this.stateCache = persistedState;
    return clone(this.stateCache);
  }

  async saveStateWithLifecycleEvents(state: RoutingState, events: RoutingLifecycleEvent[]): Promise<RoutingState> {
    const normalized = normalizeState(state);
    await this.assertStateNaturalKeys(normalized);
    const result = await this.withRoutingTransaction(async (client) => {
      const nextVersion = await this.saveStateSnapshot(normalized, client);
      const persistedState = await this.saveStateSideTables(normalized, client, false);
      for (const event of events) {
        await appendLifecycleEvent(client, event);
      }
      return { nextVersion, persistedState };
    });
    this.stateCache = result.persistedState;
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

  private async saveStateSideTables(state: RoutingState, client: PrismaRoutingClient = this.client, updateCache = true): Promise<RoutingState> {
    const persistedJobs: RoutingJobDescriptor[] = [];
    const persistedOperatorCapacities: OperatorCapacityRecord[] = [];
    const persistedQueueMemberships: QueueMembershipRecord[] = [];
    const persistedRoutingAnalyticsRows: RoutingAnalyticsRow[] = [];
    const persistedRoutingRules: RoutingRuleRecord[] = [];

    for (const job of state.jobs) {
      const create = toPrismaRoutingJobCreateInput(job);
      const row = await client.routingJob.upsert({
        create,
        update: toPrismaRoutingJobUpdateInput(create),
        where: { id: create.id }
      });
      persistedJobs.push(toRoutingJobDescriptor(row));
    }
    for (const capacity of state.operatorCapacities) {
      const create = toPrismaOperatorCapacityCreateInput(capacity);
      const row = await client.operatorCapacity.upsert({
        create,
        update: toPrismaOperatorCapacityUpdateInput(create),
        where: { id: capacity.id }
      });
      persistedOperatorCapacities.push(toOperatorCapacityRecord(row));
    }
    for (const membership of state.queueMemberships) {
      const create = toPrismaQueueMembershipCreateInput(membership);
      const row = await client.queueMembership.upsert({
        create,
        update: toPrismaQueueMembershipUpdateInput(create),
        where: { id: membership.id }
      });
      persistedQueueMemberships.push(toQueueMembershipRecord(row));
    }
    if (state.routingAnalyticsRows.length && client.routingAnalyticsRow.createMany) {
      await client.routingAnalyticsRow.createMany({
        data: state.routingAnalyticsRows.map(toPrismaRoutingAnalyticsCreateInput),
        skipDuplicates: true
      });
      persistedRoutingAnalyticsRows.push(...state.routingAnalyticsRows.map(normalizeRoutingAnalyticsRow));
    } else {
      for (const row of state.routingAnalyticsRows) {
        const create = toPrismaRoutingAnalyticsCreateInput(row);
        const persisted = await client.routingAnalyticsRow.upsert({
          create,
          update: toPrismaRoutingAnalyticsUpdateInput(create),
          where: { id: row.id }
        });
        persistedRoutingAnalyticsRows.push(toRoutingAnalyticsRow(persisted));
      }
    }
    for (const rule of state.routingRules) {
      const create = toPrismaRoutingRuleCreateInput(rule);
      const row = await client.routingRule.upsert({
        create,
        update: toPrismaRoutingRuleUpdateInput(create),
        where: { id: rule.id }
      });
      persistedRoutingRules.push(toRoutingRuleRecord(row));
    }

    const persistedState = normalizeState({
      ...state,
      jobs: persistedJobs,
      operatorCapacities: persistedOperatorCapacities,
      queueMemberships: persistedQueueMemberships,
      routingAnalyticsRows: persistedRoutingAnalyticsRows,
      routingRules: persistedRoutingRules
    });
    if (updateCache) {
      this.stateCache = persistedState;
    }
    return persistedState;
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

  private async saveStateSnapshot(
    state: RoutingState,
    client: PrismaRoutingClient = this.client,
    expectedVersion?: number,
    retriesRemaining = 1
  ): Promise<number> {
    const resolvedVersion = expectedVersion ?? (await this.readCurrentStateSnapshot(client)).version;
    const create = {
      ...toPrismaRoutingStateSnapshotCreateInput(state),
      version: resolvedVersion > 0 ? resolvedVersion + 1 : 1
    };
    if (resolvedVersion === 0) {
      const snapshot = await client.routingStateSnapshot.create({ data: create });
      return snapshot.version;
    } else {
      const result = await client.routingStateSnapshot.updateMany({
        data: toPrismaRoutingStateSnapshotUpdateInput(create),
        where: { id: ROUTING_STATE_SNAPSHOT_ID, version: resolvedVersion }
      });
      if (result.count !== 1) {
        if (expectedVersion === undefined && retriesRemaining > 0) {
          return this.saveStateSnapshot(state, client, undefined, retriesRemaining - 1);
        }
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

async function appendLifecycleEvent(client: PrismaRoutingClient, event: RoutingLifecycleEvent): Promise<void> {
  await client.conversationLifecycleEvent.create({
    data: {
      actorId: event.actorId,
      actorName: event.actorName,
      actorType: event.actorType,
      conversationId: event.conversationId,
      data: event.data as Prisma.InputJsonValue,
      eventType: event.eventType,
      id: event.id,
      ingestedAt: new Date(event.ingestedAt),
      occurredAt: new Date(event.occurredAt),
      reason: event.reason,
      schemaVersion: event.schemaVersion,
      source: event.source,
      sourceEventId: event.sourceEventId,
      tenantId: event.tenantId,
      traceId: event.traceId
    }
  });
}

async function appendRealtimeEvent(client: PrismaRoutingClient, event: RealtimeEvent): Promise<void> {
  if (!client.conversationRealtimeEvent) {
    throw new Error("prisma_manual_routing_delegates_required");
  }
  await client.conversationRealtimeEvent.create({
    data: {
      data: event.data as Prisma.InputJsonValue,
      eventId: event.eventId,
      eventName: event.eventName,
      id: event.eventId,
      occurredAt: new Date(event.occurredAt),
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      schemaVersion: event.schemaVersion,
      tenantId: event.tenantId,
      traceId: event.traceId
    }
  });
}

function assertManualTransitionEnvelope(input: RoutingManualTransitionInput, conversation: RoutingConversation): void {
  const realtimeMatches = input.realtimeEvent.tenantId === input.tenantId
    && input.realtimeEvent.resourceId === input.conversationId
    && input.realtimeEvent.resourceType === "conversation";
  const lifecycleMatches = input.lifecycleEvents.length > 0 && input.lifecycleEvents.every((event) =>
    event.tenantId === input.tenantId && event.conversationId === input.conversationId
  );
  const stateMatches = input.action === "return_queue"
    ? conversation.status === "queued" && !conversation.operatorId
    : input.action === "transfer"
      ? conversation.status === "transferred" && Boolean(conversation.operatorId)
      : input.action === "assign"
        ? conversation.status === "assigned" && Boolean(conversation.operatorId)
        : input.action === "pause_sla"
          ? conversation.status === "paused"
          : input.action === "start_rescue"
            ? conversation.rescue?.state === "active"
            : conversation.rescue?.state !== "active";
  if (!realtimeMatches || !lifecycleMatches || !stateMatches) {
    throw new Error("routing_manual_transition_invalid");
  }
}

function routingWorkerLifecycleEvent(input: {
  action: string;
  completedAt: string;
  conversationId: string;
  data: Record<string, unknown>;
  eventType: string;
  jobId: string;
  tenantId: string;
}): RoutingLifecycleEvent {
  const sourceEventId = `${input.jobId}:${input.action}`;
  return {
    actorId: null,
    actorName: null,
    actorType: "worker",
    conversationId: input.conversationId,
    data: input.data,
    eventType: input.eventType,
    id: `lifecycle_routing_${sourceEventId}`,
    ingestedAt: input.completedAt,
    occurredAt: input.completedAt,
    reason: null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "routing-worker",
    sourceEventId,
    tenantId: input.tenantId,
    traceId: `routing-job:${input.jobId}`
  };
}

function createDurableRoutingRepository(store: DurableStore<RoutingState>): RoutingRepositoryPort {
  const lifecycleEventKeys = new Set<string>();
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
        if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
          outcome = skippedRescueReturn(input.jobId, conversationId, "lease_lost");
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
        lifecycleEventKeys.add(`${tenantId}:routing-worker:${input.jobId}:auto_return`);
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
                leaseExpiresAt: undefined,
                leaseOwner: undefined,
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
        if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
          outcome = skippedSlaTimer(input, "lease_lost");
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
        const tenantId = input.tenantId ?? conversation.tenantId;
        if (!tenantId || (input.tenantId && conversation.tenantId !== input.tenantId)) {
          outcome = skippedSlaTimer({ ...input, conversationId }, "tenant_context_mismatch");
          return current;
        }

        lifecycleEventKeys.add(`${tenantId}:routing-worker:${input.jobId}:${input.action}`);
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
                leaseExpiresAt: undefined,
                leaseOwner: undefined,
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
        if (!job
          || job.queue !== input.queue
          || (job.status ?? null) !== input.expectedStatus
          || (job.leaseExpiresAt ?? null) !== (input.expectedLeaseExpiresAt ?? null)
          || (job.leaseOwner ?? null) !== (input.expectedLeaseOwner ?? null)) {
          return current;
        }

        const claimedAt = new Date(input.claimedAt);
        persisted = {
          ...job,
          claimedAt: input.claimedAt,
          completedAt: undefined,
          leaseExpiresAt: new Date(claimedAt.getTime() + positiveLeaseDuration(input.leaseDurationMs)).toISOString(),
          leaseOwner: input.workerId?.trim() || `routing-worker:${process.pid}`,
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
    },

    saveBatchRoutingTransition(input: RoutingBatchTransitionInput): MaybePromise<RoutingState> {
      return this.saveStateWithLifecycleEvents(input.state, input.lifecycleEvents);
    },

    saveManualRoutingTransition(input: RoutingManualTransitionInput): MaybePromise<RoutingState> {
      return this.saveStateWithLifecycleEvents(input.state, input.lifecycleEvents);
    },

    saveStateWithLifecycleEvents(state: RoutingState, events: RoutingLifecycleEvent[]): RoutingState {
      for (const event of events) {
        const key = `${event.tenantId}:${event.source}:${event.sourceEventId}`;
        if (lifecycleEventKeys.has(key)) {
          continue;
        }
        lifecycleEventKeys.add(key);
      }
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
  if (value === "primary" || value === "backup" || value === "member" || value === "observer") {
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
  const result: RoutingJobDescriptor = {
    ...payload,
    ...(row.action !== null ? { action: row.action } : {}),
    ...(row.conversationId !== null ? { conversationId: row.conversationId } : {}),
    id: row.id,
    ...(row.kind !== null ? { kind: row.kind } : {}),
    ...(row.claimedAt !== null ? { claimedAt: row.claimedAt.toISOString() } : {}),
    ...(row.leaseExpiresAt !== null ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
    ...(row.leaseOwner !== null ? { leaseOwner: row.leaseOwner } : {}),
    queue: row.queue,
    ...(row.redistributionId !== null ? { redistributionId: row.redistributionId } : {}),
    ...(row.runAt !== null ? { runAt: row.runAt } : {}),
    ...(row.status !== null ? { status: row.status } : {})
  };
  if (row.claimedAt === null) delete result.claimedAt;
  if (row.leaseExpiresAt === null) delete result.leaseExpiresAt;
  if (row.leaseOwner === null) delete result.leaseOwner;
  return result;
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
    claimedAt: typeof job.claimedAt === "string" ? new Date(job.claimedAt) : null,
    conversationId: typeof job.conversationId === "string" ? job.conversationId : null,
    id: job.id,
    kind: typeof job.kind === "string" ? job.kind : null,
    leaseExpiresAt: typeof job.leaseExpiresAt === "string" ? new Date(job.leaseExpiresAt) : null,
    leaseOwner: typeof job.leaseOwner === "string" ? job.leaseOwner : null,
    payload: clone(job),
    queue: job.queue,
    redistributionId: typeof job.redistributionId === "string" ? job.redistributionId : null,
    runAt: typeof job.runAt === "number" || typeof job.runAt === "string" ? job.runAt : Prisma.DbNull,
    status: typeof job.status === "string" ? job.status : null
  };
}

function positiveLeaseDuration(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 60_000;
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
