import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  rescueReportSeedRows,
  routingConversationFixtures,
  routingOperatorFixtures,
  routingQueueFixtures,
  type RescueReportRow,
  type RoutingConversation,
  type RoutingOperator,
  type RoutingQueue,
  type RoutingRescueState
} from "./routing.fixtures.js";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
  type RoutingAnalyticsRow,
  type RoutingJobDescriptor,
  type RoutingRuleRecord
} from "./routing.repository.js";

const ROUTING_SERVICE = "routingService";
const DEFAULT_TENANT_ID = "tenant-volga";
const RESCUE_DURATION_SECONDS = 4 * 60;
const supportedAssignmentActions = new Set(["assign", "return_queue", "transfer"]);
const supportedRescueOutcomes = new Set(["missed", "returned_to_queue", "saved"]);
type AssignmentAction = "assign" | "return_queue" | "transfer";
type RescueOutcome = "missed" | "returned_to_queue" | "saved";

interface WorkloadFilters {
  channel?: string;
}

interface AssignmentPayload {
  action?: string;
  conversationId: string;
  overrideLimit?: boolean;
  reason?: string;
  targetOperatorId?: string;
}

interface AssignmentSimulationPayload {
  conversationId: string;
}

interface SlaPausePayload {
  conversationId: string;
  durationMinutes?: number | string;
  reason?: string;
}

interface RescueStartPayload {
  conversationId: string;
  durationSeconds?: number;
  reason?: string;
  source?: string;
}

interface RescueResolvePayload {
  conversationId: string;
  outcome?: string;
  reason?: string;
}

interface RescueReportFilters {
  period?: string;
}

export class RoutingService {
  private conversations: RoutingConversation[];
  private operators: RoutingOperator[];
  private queues: RoutingQueue[];
  private rescueReportRows: RescueReportRow[];

  constructor(private readonly routingRepository = RoutingRepository.default()) {
    const state = routingRepository.readState();
    this.conversations = state.conversations.length ? state.conversations : clone(routingConversationFixtures);
    this.operators = state.operators.length ? state.operators : clone(routingOperatorFixtures);
    this.queues = state.queues.length ? state.queues : clone(routingQueueFixtures);
    this.rescueReportRows = state.rescueReportRows.length ? state.rescueReportRows : clone(rescueReportSeedRows);
  }

  async fetchWorkload(filters: WorkloadFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const channel = normalizeChannel(filters.channel);
    const queues = this.filterQueues(channel);
    const memberships = await this.listActiveQueueMemberships(channel);
    const capacities = await this.listOperatorCapacities(channel);
    const routingPolicy = await this.resolveRoutingPolicy(channel);
    const routingAnalyticsRows = await this.routingRepository.listRoutingAnalyticsRows({ tenantId: DEFAULT_TENANT_ID });
    const operators = this.operators
      .filter((operator) => this.operatorCanAccessChannel(operator, channel, memberships))
      .map((operator) => operatorProjection(
        operator,
        channel,
        findCapacityForOperator(capacities, operator.id, channel),
        hasMembershipChannelAccess(memberships, operator.id, channel)
      ));

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "fetchWorkload",
      traceId: routingTraceId("fetchWorkload"),
      partial: true,
      meta: apiMeta({ filters, channel: channel ?? "all" }),
      data: {
        operators,
        queues: queues.map(queueProjection),
        refreshedAt: new Date().toISOString(),
        routingAnalytics: routingAnalyticsProjection(routingAnalyticsRows, channel),
        routingPolicy,
        totals: {
          activeChats: sumBy(queues, "active"),
          onlineOperators: operators.filter((operator) => operator.status === "online").length,
          overdueChats: sumBy(queues, "overdue"),
          rescueActive: operators.reduce((sum, operator) => sum + Number(operator.rescueActive), 0),
          waitingChats: sumBy(queues, "waiting")
        }
      }
    });
  }

  async createAssignment(payload: AssignmentPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = this.findConversation(payload.conversationId);
    const action = normalizeAssignmentAction(payload.action);

    if (!conversation) {
      return notFoundEnvelope("createAssignment", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    if (!action) {
      return invalidEnvelope("createAssignment", "assignment_action_unsupported", `Assignment action ${payload.action ?? "(empty)"} is not supported.`, {
        action: payload.action ?? null,
        conversationId: conversation.id,
        supportedActions: Array.from(supportedAssignmentActions)
      });
    }

    if (conversation.status === "closed") {
      return deniedEnvelope("createAssignment", "conversation_closed", "Closed conversations cannot be reassigned.", {
        conversationId: conversation.id,
        guard: "closed_dialog_blocked"
      });
    }

    if (!hasReason(payload.reason)) {
      return invalidEnvelope("createAssignment", "assignment_reason_required", "A routing reason of at least 8 characters is required.", {
        action,
        conversationId: conversation.id
      });
    }

    if (action === "return_queue") {
      return this.returnConversationToQueue(conversation, payload.reason);
    }

    const operator = this.findOperator(payload.targetOperatorId ?? "");

    if (!operator) {
      return notFoundEnvelope("createAssignment", "operator_not_found", `Operator ${payload.targetOperatorId ?? "(empty)"} was not found.`, {
        conversationId: conversation.id,
        operatorId: payload.targetOperatorId ?? null
      });
    }

    const hasChannelAccess = await this.operatorHasChannelAccess(operator, conversation.channel);
    if (!hasChannelAccess) {
      return deniedEnvelope("createAssignment", "operator_channel_denied", "Operator is not assigned to the conversation channel.", {
        conversationChannel: conversation.channel,
        guard: "operator_channel_limit",
        operatorChannels: operator.channels,
        operatorId: operator.id
      });
    }

    if (operator.status !== "online") {
      return deniedEnvelope("createAssignment", "operator_unavailable", "Operator is not online.", {
        guard: "operator_channel_limit",
        operatorId: operator.id,
        operatorStatus: operator.status
      });
    }

    const capacity = await this.routingRepository.findOperatorCapacityByOperatorChannel(DEFAULT_TENANT_ID, operator.id, conversation.channel);
    const operatorLimit = capacity?.chatLimit ?? operator.limit;
    const availableCapacity = Math.max(0, operatorLimit - operator.chats);

    if (availableCapacity <= 0) {
      return deniedEnvelope("createAssignment", "operator_limit_exceeded", "Operator chat limit has been reached.", {
        availableCapacity,
        guard: "operator_channel_limit",
        limit: operatorLimit,
        operatorId: operator.id,
        overrideRequested: Boolean(payload.overrideLimit),
        overrideSupported: capacity?.overrideAllowed ?? false
      });
    }

    const previousOperatorId = conversation.operatorId ?? null;
    const previousStatus = conversation.status;
    conversation.operatorId = operator.id;
    conversation.status = action === "transfer" ? "transferred" : "assigned";
    conversation.slaTone = conversation.slaTone === "closed" ? "ok" : conversation.slaTone;
    this.moveOperatorAssignment(previousOperatorId, operator.id);
    if (previousStatus === "queued") {
      this.moveQueueWaitingToActive(conversation.channel);
    }
    const assignmentJob = queueJob("assignment.commit", "routing-assignments");
    this.saveJob(assignmentJob);
    if (action === "assign" || action === "transfer") {
      await this.routingRepository.saveRoutingAnalyticsRow({
        channel: conversation.channel,
        conversationId: conversation.id,
        eventKind: action === "transfer" ? "transfer" : "assignment",
        fromOperatorId: previousOperatorId,
        id: makeId(action === "transfer" ? "analytics_transfer" : "analytics_assignment"),
        occurredAt: new Date().toISOString(),
        source: "api",
        tenantId: DEFAULT_TENANT_ID,
        toOperatorId: operator.id
      });
    }
    this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "createAssignment",
      traceId: routingTraceId("createAssignment"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        assignment: {
          action,
          conversationId: conversation.id,
          fromOperatorId: previousOperatorId,
          targetOperatorId: operator.id
        },
        auditEvent: auditEvent("routing_assignment", "routing.assignment.commit", payload.reason),
        conversation: clone(conversation),
        guard: "operator_channel_limit",
        queueJob: assignmentJob,
        realtimeEvent: realtimeEvent("routing.assignment.updated", conversation.id, {
          action,
          fromStatus: previousStatus,
          toStatus: conversation.status
        })
      }
    });
  }

  async simulateAssignment(payload: AssignmentSimulationPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = this.findConversation(payload.conversationId);
    if (!conversation) {
      return notFoundEnvelope("simulateAssignment", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const memberships = await this.listActiveQueueMemberships(conversation.channel);
    const capacities = await this.listOperatorCapacities(conversation.channel);
    const candidates = this.operators.map((operator) => {
      const capacity = findCapacityForOperator(capacities, operator.id, conversation.channel);
      const queueMembership = findMembershipForOperator(memberships, operator.id, conversation.channel);
      const chatLimit = capacity?.chatLimit ?? operator.limit;
      const channelAccess = this.operatorCanAccessChannel(operator, conversation.channel, memberships);
      const availableCapacity = Math.max(0, chatLimit - operator.chats);
      const online = operator.status === "online";
      const explain = [
        channelAccess ? "channel_access:granted" : "channel_access:denied",
        `status:${operator.status}`,
        availableCapacity > 0 ? "capacity:available" : "capacity:full"
      ];

      return {
        operatorId: operator.id,
        status: operator.status,
        chats: operator.chats,
        chatLimit,
        availableCapacity,
        channelAccess,
        explain,
        loadRatio: chatLimit > 0 ? Number((operator.chats / chatLimit).toFixed(2)) : 1,
        queueMembership: hasMembershipChannelAccess(memberships, operator.id, conversation.channel),
        queueMembershipRole: queueMembership?.role ?? null,
        recommendation: channelAccess && online && availableCapacity > 0 ? "eligible" : "blocked"
      };
    }).sort(compareAssignmentCandidates);

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "simulateAssignment",
      traceId: routingTraceId("simulateAssignment"),
      meta: apiMeta({ conversationId: conversation.id, channel: conversation.channel }),
      data: {
        candidateInputsValidated: true,
        candidates,
        channel: conversation.channel,
        conversationId: conversation.id,
        rankingStrategy: "least_loaded"
      }
    });
  }

  async pauseSla(payload: SlaPausePayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = this.findConversation(payload.conversationId);

    if (!conversation) {
      return notFoundEnvelope("pauseSla", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    if (conversation.status === "closed") {
      return deniedEnvelope("pauseSla", "conversation_closed", "Closed conversations cannot pause SLA.", {
        conversationId: conversation.id,
        guard: "closed_dialog_blocked"
      });
    }

    if (!hasReason(payload.reason)) {
      return invalidEnvelope("pauseSla", "sla_pause_reason_required", "An SLA pause reason of at least 8 characters is required.", {
        conversationId: conversation.id,
        guard: "reason_required"
      });
    }

    const durationMinutes = toPositiveInt(payload.durationMinutes, 15);
    conversation.status = "paused";
    conversation.slaTone = "hold";
    const pausedUntil = addMinutes(durationMinutes);
    const schedulerJob = {
      id: makeId("job_sla_resume"),
      action: "resume_sla",
      queue: "sla-timers",
      runAt: pausedUntil.toISOString()
    };
    this.saveJob(schedulerJob);
    this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "pauseSla",
      traceId: routingTraceId("pauseSla"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("sla", "sla.pause", payload.reason),
        conversation: clone(conversation),
        realtimeEvent: realtimeEvent("sla.paused", conversation.id, {
          durationMinutes,
          reason: payload.reason
        }),
        schedulerJob,
        sla: {
          durationMinutes,
          pausedUntil: pausedUntil.toISOString(),
          reason: payload.reason,
          state: "paused"
        }
      }
    });
  }

  async startRescue(payload: RescueStartPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = this.findConversation(payload.conversationId);

    if (!conversation) {
      return notFoundEnvelope("startRescue", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    if (conversation.status === "closed") {
      return deniedEnvelope("startRescue", "conversation_closed", "Closed conversations cannot start rescue.", {
        conversationId: conversation.id,
        guard: "closed_dialog_blocked"
      });
    }

    if (conversation.rescue?.state === "active") {
      return conflictEnvelope("startRescue", "rescue_already_active", "Conversation already has an active rescue timer.", {
        conversationId: conversation.id,
        rescue: clone(conversation.rescue)
      });
    }

    const startedAt = Date.now();
    const deadlineAt = startedAt + RESCUE_DURATION_SECONDS * 1000;
    const previousStatus = conversation.status;
    const rescue: RoutingRescueState = {
      state: "active",
      startedAt,
      deadlineAt,
      durationSeconds: RESCUE_DURATION_SECONDS,
      reason: payload.reason?.trim() || "Manual rescue start",
      nextAction: "reply_or_return_to_sla_queue",
      source: payload.source?.trim() || "manual"
    };
    conversation.rescue = rescue;
    conversation.status = "assigned";
    conversation.slaTone = "danger";
    this.moveOperatorRescueActive(conversation.operatorId ?? null, 1);
    if (previousStatus === "queued") {
      this.moveQueueWaitingToActive(conversation.channel);
    }
    const schedulerJob = {
      id: makeId("job_rescue_return"),
      action: "return_to_sla_queue",
      conversationId: conversation.id,
      queue: "rescue-return",
      runAt: rescue.deadlineAt
    };
    this.saveJob(schedulerJob);
    await this.routingRepository.saveRoutingAnalyticsRow({
      channel: conversation.channel,
      conversationId: conversation.id,
      eventKind: "rescue",
      fromOperatorId: null,
      id: makeId("analytics_rescue"),
      occurredAt: new Date().toISOString(),
      source: rescue.source,
      tenantId: DEFAULT_TENANT_ID,
      toOperatorId: conversation.operatorId ?? null
    });
    this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "startRescue",
      traceId: routingTraceId("startRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.start", rescue.reason),
        conversation: clone(conversation),
        queuePriority: "rescue",
        realtimeEvent: realtimeEvent("rescue.started", conversation.id, {
          deadlineAt: rescue.deadlineAt,
          durationSeconds: rescue.durationSeconds
        }),
        reportEvent: reportEvent("rescue.started", "active"),
        rescue: clone(rescue),
        schedulerJob
      }
    });
  }

  async resolveRescue(payload: RescueResolvePayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const conversation = this.findConversation(payload.conversationId);

    if (!conversation) {
      return notFoundEnvelope("resolveRescue", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    if (conversation.rescue?.state !== "active") {
      return invalidEnvelope("resolveRescue", "rescue_not_active", "Conversation does not have an active rescue timer.", {
        conversationId: conversation.id
      });
    }

    const outcome = normalizeRescueOutcome(payload.outcome);
    if (!outcome) {
      return invalidEnvelope("resolveRescue", "rescue_outcome_unsupported", `Rescue outcome ${payload.outcome ?? "(empty)"} is not supported.`, {
        conversationId: conversation.id,
        outcome: payload.outcome ?? null,
        supportedOutcomes: Array.from(supportedRescueOutcomes)
      });
    }

    const previousOperatorId = conversation.operatorId ?? null;
    conversation.rescue = {
      ...conversation.rescue,
      reason: payload.reason?.trim() || conversation.rescue.reason,
      state: outcome
    };

    if (outcome === "returned_to_queue" || outcome === "missed") {
      const previousStatus = conversation.status;
      this.moveOperatorAssignment(previousOperatorId, null);
      conversation.status = "queued";
      conversation.operatorId = undefined;
      conversation.slaTone = outcome === "missed" ? "danger" : "hold";
      if (previousStatus !== "queued") {
        this.moveQueueActiveToWaiting(conversation.channel);
      }
    } else {
      conversation.status = "active";
      conversation.slaTone = "ok";
    }
    this.moveOperatorRescueActive(previousOperatorId, -1);

    this.rescueReportRows.push({
      conversationId: conversation.id,
      channel: conversation.channel,
      operatorId: previousOperatorId,
      timerSeconds: conversation.rescue.durationSeconds,
      reason: conversation.rescue.reason,
      outcome,
      resolution: payload.reason?.trim() || "Resolved by operator",
      digest: "daily_rescue"
    });
    const rescueReturnJob = outcome === "returned_to_queue" || outcome === "missed"
      ? {
          ...queueJob("rescue.return_queue", "rescue-return"),
          action: "return_to_sla_queue",
          conversationId: conversation.id,
          status: "pending"
        }
      : null;
    if (rescueReturnJob) {
      this.saveJob(rescueReturnJob);
    }
    this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "resolveRescue",
      traceId: routingTraceId("resolveRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.resolve", payload.reason),
        conversation: clone(conversation),
        queueJob: rescueReturnJob,
        realtimeEvent: realtimeEvent("rescue.resolved", conversation.id, { outcome }),
        reportEvent: reportEvent("rescue.report.ready", outcome),
        rescue: clone(conversation.rescue)
      }
    });
  }

  async fetchRescueReport(filters: RescueReportFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const rows = clone(this.rescueReportRows);
    const outcomeSummary = summarizeOutcomes(rows);
    const routingAnalyticsRows = (await this.routingRepository.listRoutingAnalyticsRows({ tenantId: DEFAULT_TENANT_ID }))
      .filter((row) => row.eventKind === "rescue" || row.eventKind === "auto_return");

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "fetchRescueReport",
      traceId: routingTraceId("fetchRescueReport"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        exportDescriptor: {
          auditId: makeId("evt_rescue_export"),
          fileType: "xlsx",
          metricDefinitionVersion: "routing-rescue-v1",
          queue: "report_export_queue",
          status: "ready"
        },
        outcomeSummary,
        routingAnalytics: routingAnalyticsProjection(routingAnalyticsRows),
        rows
      }
    });
  }

  private returnConversationToQueue(conversation: RoutingConversation, reason?: string): BackendEnvelope<Record<string, unknown>> {
    const previousOperatorId = conversation.operatorId ?? null;
    const previousStatus = conversation.status;
    conversation.operatorId = undefined;
    conversation.status = "queued";
    conversation.slaTone = conversation.slaTone === "danger" ? "danger" : "hold";
    this.moveOperatorAssignment(previousOperatorId, null);
    if (previousStatus !== "queued") {
      this.moveQueueActiveToWaiting(conversation.channel);
    }
    const assignmentJob = queueJob("assignment.return_queue", "routing-assignments");
    this.saveJob(assignmentJob);
    this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "createAssignment",
      traceId: routingTraceId("createAssignment"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        assignment: {
          action: "return_queue",
          conversationId: conversation.id,
          fromOperatorId: previousOperatorId,
          targetOperatorId: null
        },
        auditEvent: auditEvent("routing_assignment", "routing.assignment.return_queue", reason),
        conversation: clone(conversation),
        guard: "operator_channel_limit",
        queueJob: assignmentJob,
        realtimeEvent: realtimeEvent("routing.assignment.updated", conversation.id, {
          action: "return_queue",
          toStatus: conversation.status
        })
      }
    });
  }

  private moveOperatorAssignment(previousOperatorId: string | null, nextOperatorId: string | null): void {
    if (previousOperatorId && previousOperatorId !== nextOperatorId) {
      const previousOperator = this.findOperator(previousOperatorId);
      if (previousOperator) {
        previousOperator.chats = Math.max(0, previousOperator.chats - 1);
      }
    }

    if (nextOperatorId && previousOperatorId !== nextOperatorId) {
      const nextOperator = this.findOperator(nextOperatorId);
      if (nextOperator) {
        nextOperator.chats += 1;
      }
    }
  }

  private moveOperatorRescueActive(operatorId: string | null, delta: number): void {
    if (!operatorId) {
      return;
    }

    const operator = this.findOperator(operatorId);
    if (operator) {
      operator.rescueActive = Math.max(0, operator.rescueActive + delta);
    }
  }

  private moveQueueWaitingToActive(channel: string): void {
    const queue = this.findQueue(channel);
    if (queue) {
      queue.waiting = Math.max(0, queue.waiting - 1);
      queue.active += 1;
    }
  }

  private filterQueues(channel?: string): RoutingQueue[] {
    return this.queues.filter((queue) => !channel || queue.channel === channel);
  }

  private findConversation(conversationId: string): RoutingConversation | undefined {
    return this.conversations.find((conversation) => conversation.id === conversationId);
  }

  private findOperator(operatorId: string): RoutingOperator | undefined {
    return this.operators.find((operator) => operator.id === operatorId);
  }

  private findQueue(channel: string): RoutingQueue | undefined {
    return this.queues.find((queue) => queue.channel === channel);
  }

  private moveQueueActiveToWaiting(channel: string): void {
    const queue = this.findQueue(channel);
    if (queue) {
      queue.active = Math.max(0, queue.active - 1);
      queue.waiting += 1;
    }
  }

  private async listActiveQueueMemberships(channel?: string): Promise<QueueMembershipRecord[]> {
    return this.routingRepository.listQueueMemberships({
      active: true,
      ...(channel ? { queueId: channel } : {}),
      tenantId: DEFAULT_TENANT_ID
    });
  }

  private async listOperatorCapacities(channel?: string): Promise<OperatorCapacityRecord[]> {
    return this.routingRepository.listOperatorCapacities({
      ...(channel ? { channel } : {}),
      tenantId: DEFAULT_TENANT_ID
    });
  }

  private async operatorHasChannelAccess(operator: RoutingOperator, channel: string): Promise<boolean> {
    const memberships = await this.listActiveQueueMemberships(channel);
    return this.operatorCanAccessChannel(operator, channel, memberships);
  }

  private operatorCanAccessChannel(operator: RoutingOperator, channel: string | undefined, memberships: QueueMembershipRecord[]): boolean {
    if (!channel) {
      return true;
    }

    if (memberships.length > 0) {
      return hasMembershipChannelAccess(memberships, operator.id, channel);
    }

    return operator.channels.includes(channel);
  }

  private async resolveRoutingPolicy(channel?: string): Promise<Record<string, unknown>> {
    const rules = await this.routingRepository.listRoutingRules({
      enabled: true,
      tenantId: DEFAULT_TENANT_ID
    });
    const rule = findRoutingPolicyRule(rules, channel);

    return {
      limitMode: rule?.limitMode ?? "operator_channel_limit",
      priorityStrategy: rule?.priorityStrategy ?? "least_loaded",
      serverValidated: true,
      waitThresholdSeconds: rule?.waitThresholdSeconds ?? 180
    };
  }

  private persistState(): void {
    const current = this.routingRepository.readState();
    this.routingRepository.saveState({
      conversations: this.conversations,
      jobs: this.routingRepository.listJobs(),
      operatorCapacities: current.operatorCapacities,
      operators: this.operators,
      queueMemberships: current.queueMemberships,
      queues: this.queues,
      routingAnalyticsRows: current.routingAnalyticsRows,
      rescueReportRows: this.rescueReportRows,
      routingRules: current.routingRules
    });
  }

  private saveJob(job: Record<string, unknown>): RoutingJobDescriptor {
    return this.routingRepository.saveJob(job as unknown as RoutingJobDescriptor);
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(scope: string, action: string, reason?: string): Record<string, unknown> {
  return {
    id: makeId(`evt_${scope}`),
    action,
    immutable: true,
    reason: reason?.trim() || null
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deniedEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: ROUTING_SERVICE,
    operation,
    traceId: routingTraceId(operation),
    status: "denied",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: ROUTING_SERVICE,
    operation,
    traceId: routingTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: ROUTING_SERVICE,
    operation,
    traceId: routingTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: ROUTING_SERVICE,
    operation,
    traceId: routingTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function addMinutes(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function hasReason(reason?: string): boolean {
  return String(reason ?? "").trim().length >= 8;
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function normalizeChannel(channel?: string): string | undefined {
  const value = String(channel ?? "").trim();
  return value && value.toLowerCase() !== "all" ? value : undefined;
}

function normalizeAssignmentAction(action?: string): AssignmentAction | null {
  const value = String(action ?? "assign").trim();
  return supportedAssignmentActions.has(value) ? value as AssignmentAction : null;
}

function normalizeRescueOutcome(outcome?: string): RescueOutcome | null {
  const value = String(outcome ?? "saved").trim();
  return supportedRescueOutcomes.has(value) ? value as RescueOutcome : null;
}

function findCapacityForOperator(capacities: OperatorCapacityRecord[], operatorId: string, selectedChannel?: string): OperatorCapacityRecord | undefined {
  return capacities.find((capacity) => capacity.operatorId === operatorId && (!selectedChannel || capacity.channel === selectedChannel));
}

function findRoutingPolicyRule(rules: RoutingRuleRecord[], selectedChannel?: string): RoutingRuleRecord | undefined {
  return selectedChannel
    ? rules.find((rule) => rule.channel === selectedChannel) ?? rules.find((rule) => rule.channel === "*")
    : rules.find((rule) => rule.channel === "*");
}

function hasMembershipChannelAccess(memberships: QueueMembershipRecord[], operatorId: string, selectedChannel?: string): boolean {
  return memberships.some((membership) =>
    membership.operatorId === operatorId
    && membership.active
    && membership.role !== "observer"
    && (!selectedChannel || membership.queueId === selectedChannel)
  );
}

function findMembershipForOperator(
  memberships: QueueMembershipRecord[],
  operatorId: string,
  selectedChannel?: string
): QueueMembershipRecord | undefined {
  return memberships.find((membership) =>
    membership.operatorId === operatorId
    && membership.active
    && (!selectedChannel || membership.queueId === selectedChannel)
  );
}

function membershipRoleRank(role: string): number {
  if (role === "primary") {
    return 0;
  }
  if (role === "backup") {
    return 1;
  }
  if (role === "observer") {
    return 3;
  }
  return 2;
}

function compareAssignmentCandidates(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftEligible = left.recommendation === "eligible" ? 0 : 1;
  const rightEligible = right.recommendation === "eligible" ? 0 : 1;
  if (leftEligible !== rightEligible) {
    return leftEligible - rightEligible;
  }

  const leftChannelAccess = left.channelAccess === true ? 0 : 1;
  const rightChannelAccess = right.channelAccess === true ? 0 : 1;
  if (leftChannelAccess !== rightChannelAccess) {
    return leftChannelAccess - rightChannelAccess;
  }

  const leftMembershipRole = membershipRoleRank(String(left.queueMembershipRole ?? ""));
  const rightMembershipRole = membershipRoleRank(String(right.queueMembershipRole ?? ""));
  if (leftMembershipRole !== rightMembershipRole) {
    return leftMembershipRole - rightMembershipRole;
  }

  const leftLoad = Number(left.loadRatio ?? 1);
  const rightLoad = Number(right.loadRatio ?? 1);
  if (leftLoad !== rightLoad) {
    return leftLoad - rightLoad;
  }

  const leftAvailableCapacity = Number(left.availableCapacity ?? 0);
  const rightAvailableCapacity = Number(right.availableCapacity ?? 0);
  if (leftAvailableCapacity !== rightAvailableCapacity) {
    return rightAvailableCapacity - leftAvailableCapacity;
  }

  return Number(left.chats ?? 0) - Number(right.chats ?? 0);
}

function operatorProjection(
  operator: RoutingOperator,
  selectedChannel?: string,
  capacity?: OperatorCapacityRecord,
  channelAccessGranted = false
): Record<string, unknown> {
  const limit = capacity?.chatLimit ?? operator.limit;
  const channels = selectedChannel && channelAccessGranted && !operator.channels.includes(selectedChannel)
    ? [...operator.channels, selectedChannel]
    : operator.channels;
  const availableCapacity = Math.max(0, limit - operator.chats);

  return {
    ...operator,
    channels,
    limit,
    avg: formatDuration(operator.avgFirstResponseSeconds),
    availableCapacity,
    canReceive: operator.status === "online" && availableCapacity > 0 && (!selectedChannel || channels.includes(selectedChannel)),
    loadRatio: limit > 0 ? Number((operator.chats / limit).toFixed(2)) : 1,
    sla: operator.slaPercent
  };
}

function queueProjection(queue: RoutingQueue): Record<string, unknown> {
  return {
    ...clone(queue),
    name: queue.channel
  };
}

function routingAnalyticsProjection(rows: RoutingAnalyticsRow[], channel?: string): Record<string, unknown> {
  const scopedRows = rows.filter((row) => !channel || row.channel === channel);
  const byEventKind = {
    assignment: 0,
    auto_return: 0,
    rescue: 0,
    transfer: 0
  };

  for (const row of scopedRows) {
    byEventKind[row.eventKind] += 1;
  }

  return {
    byEventKind,
    channel: channel ?? "all",
    tenantId: DEFAULT_TENANT_ID,
    totalEvents: scopedRows.length
  };
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.max(0, totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function queueJob(kind: string, queue: string): Record<string, unknown> {
  return {
    id: makeId("job_routing"),
    kind,
    queue,
    status: "queued"
  };
}

function realtimeEvent(eventName: string, resourceId: string, data: Record<string, unknown>): Record<string, unknown> {
  return {
    eventId: makeId("rt_routing"),
    eventName,
    occurredAt: new Date().toISOString(),
    resourceId,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: "tenant-volga",
    traceId: routingTraceId(eventName),
    data
  };
}

function reportEvent(eventName: string, outcome: string): Record<string, unknown> {
  return {
    eventId: makeId("report_rescue"),
    eventName,
    digest: "daily_rescue",
    metricDefinitionVersion: "routing-rescue-v1",
    outcome,
    sink: "reports"
  };
}

function routingTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(ROUTING_SERVICE, operation);
}

function sumBy(items: RoutingQueue[], field: "active" | "overdue" | "waiting"): number {
  return items.reduce((sum, item) => sum + item[field], 0);
}

function summarizeOutcomes(rows: Array<{ outcome: string }>): Array<{ label: string; value: number }> {
  const summary = new Map<string, number>();
  rows.forEach((row) => summary.set(row.outcome, (summary.get(row.outcome) ?? 0) + 1));
  return Array.from(summary.entries()).map(([label, value]) => ({ label, value }));
}

function toPositiveInt(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
