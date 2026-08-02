import { Prisma } from "@prisma/client";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue } from "./routing.types.js";
export type RoutingLimitMode = "operator_channel_limit" | "queue_round_robin";
export type RoutingPriorityStrategy = "least_loaded" | "round_robin" | "skill_match";
export type QueueMembershipRole = "backup" | "member" | "observer" | "primary";
export type RoutingAnalyticsEventKind = "assignment" | "auto_return" | "rescue" | "transfer";
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
        create(input: {
            data: PrismaRoutingLifecycleEventCreateInput;
        }): Promise<unknown>;
    };
    conversation?: {
        findUnique?(input: {
            where: {
                id: string;
            };
        }): Promise<{
            id: string;
            operatorId: string | null;
            status: string;
            tenantId: string;
            updatedAt: Date;
        } | null>;
        updateMany(input: {
            data: PrismaRoutingConversationUpdateInput;
            where: PrismaRoutingConversationWhereInput;
        }): Promise<{
            count: number;
        }>;
    };
    conversationRealtimeEvent?: {
        create(input: {
            data: PrismaRoutingRealtimeEventCreateInput;
        }): Promise<unknown>;
    };
    operatorCapacity: {
        findFirst(input: {
            where: PrismaOperatorCapacityWhereInput;
        }): Promise<PrismaOperatorCapacityRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaOperatorCapacityWhereInput;
        }): Promise<PrismaOperatorCapacityRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaOperatorCapacityRow | null>;
        upsert(input: {
            create: PrismaOperatorCapacityCreateInput;
            update: PrismaOperatorCapacityUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaOperatorCapacityRow>;
    };
    queueMembership: {
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaQueueMembershipWhereInput;
        }): Promise<PrismaQueueMembershipRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaQueueMembershipRow | null>;
        upsert(input: {
            create: PrismaQueueMembershipCreateInput;
            update: PrismaQueueMembershipUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaQueueMembershipRow>;
    };
    routingAnalyticsRow: {
        createMany?(input: {
            data: PrismaRoutingAnalyticsCreateInput[];
            skipDuplicates: true;
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            orderBy: {
                occurredAt: "desc";
            };
            where?: PrismaRoutingAnalyticsWhereInput;
        }): Promise<PrismaRoutingAnalyticsRow[]>;
        upsert(input: {
            create: PrismaRoutingAnalyticsCreateInput;
            update: PrismaRoutingAnalyticsUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaRoutingAnalyticsRow>;
    };
    routingJob: {
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaRoutingJobRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
        }): Promise<PrismaRoutingJobRow[]>;
        updateMany(input: {
            data: PrismaRoutingJobUpdateInput;
            where: PrismaRoutingJobWhereInput;
        }): Promise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaRoutingJobCreateInput;
            update: PrismaRoutingJobUpdateInput;
            where: {
                id: string;
            };
        }): Promise<PrismaRoutingJobRow>;
    };
    routingStateSnapshot: {
        create(input: {
            data: PrismaRoutingStateSnapshotCreateInput;
        }): Promise<PrismaRoutingStateSnapshotRow>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaRoutingStateSnapshotRow | null>;
        updateMany(input: {
            data: PrismaRoutingStateSnapshotUpdateInput;
            where: {
                id: string;
                version: number;
            };
        }): Promise<{
            count: number;
        }>;
    };
    routingRule: {
        findFirst(input: {
            where: PrismaRoutingRuleWhereInput;
        }): Promise<PrismaRoutingRuleRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "desc";
            };
            where?: PrismaRoutingRuleWhereInput;
        }): Promise<PrismaRoutingRuleRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): Promise<PrismaRoutingRuleRow | null>;
        upsert(input: {
            create: PrismaRoutingRuleCreateInput;
            update: PrismaRoutingRuleUpdateInput;
            where: {
                id: string;
            };
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
export declare class RoutingRepository implements RoutingRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): RoutingRepository;
    static useDefault(repository: RoutingRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: Partial<RoutingState>): RoutingRepository;
    static prisma({ client, fallback }: PrismaRoutingRepositoryOptions): RoutingRepository;
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
export {};
