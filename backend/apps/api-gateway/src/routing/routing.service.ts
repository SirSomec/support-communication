import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue, RoutingRescueState } from "./routing.types.js";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
  type RoutingAnalyticsRow,
  type RoutingJobDescriptor,
  type RoutingRuleRecord
} from "./routing.repository.js";

const ROUTING_SERVICE = "routingService";
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

interface RedistributionPayload {
  idempotencyKey?: string;
  previewId?: string;
  reason?: string;
  selectedQueues?: string[];
  targetRule?: string;
}

interface RedistributionPlanAssignment {
  action: "assign";
  availableCapacityBefore: unknown;
  channel: string;
  conversationId: string;
  loadRatioBefore: unknown;
  previousOperatorId: string | null;
  slaTone: RoutingConversation["slaTone"];
  targetOperatorId: string;
  targetOperatorName: string;
}

interface RedistributionPlan {
  capacityConflicts: Array<Record<string, unknown>>;
  plan: RedistributionPlanAssignment[];
  selectedQueues: string[];
  slaImpact: Record<string, unknown>;
  targetRule: string;
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

export interface RoutingRequestContext {
  tenantId?: string;
}

export class RoutingService {
  private conversations: RoutingConversation[];
  private operators: RoutingOperator[];
  private queues: RoutingQueue[];
  private rescueReportRows: RescueReportRow[];

  constructor(private readonly routingRepository = RoutingRepository.default()) {
    const state = routingRepository.readState();
    this.conversations = clone(state.conversations);
    this.operators = clone(state.operators);
    this.queues = clone(state.queues);
    this.rescueReportRows = clone(state.rescueReportRows);
  }

  async fetchWorkload(filters: WorkloadFilters = {}, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("fetchWorkload");
    }

    const channel = normalizeChannel(filters.channel);
    const queues = this.filterQueues(channel, tenantId);
    const memberships = await this.listActiveQueueMemberships(channel, tenantId);
    const capacities = await this.listOperatorCapacities(channel, tenantId);
    const routingPolicy = await this.resolveRoutingPolicy(channel, tenantId);
    const routingAnalyticsRows = await this.routingRepository.listRoutingAnalyticsRows({ tenantId });
    const operators = this.operators
      .filter((operator) => this.operatorBelongsToTenant(operator, tenantId))
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
        routingAnalytics: routingAnalyticsProjection(routingAnalyticsRows, channel, tenantId),
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

  async createAssignment(payload: AssignmentPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("createAssignment");
    }

    const conversation = this.findConversationForTenant(payload.conversationId, tenantId);
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
      return this.returnConversationToQueue(conversation, tenantId, payload.reason);
    }

    const operator = this.findOperatorForTenant(payload.targetOperatorId ?? "", tenantId);

    if (!operator) {
      return notFoundEnvelope("createAssignment", "operator_not_found", `Operator ${payload.targetOperatorId ?? "(empty)"} was not found.`, {
        conversationId: conversation.id,
        operatorId: payload.targetOperatorId ?? null
      });
    }

    const hasChannelAccess = await this.operatorHasChannelAccess(operator, conversation.channel, tenantId);
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

    const capacity = await this.routingRepository.findOperatorCapacityByOperatorChannel(tenantId, operator.id, conversation.channel);
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
    this.moveOperatorAssignment(previousOperatorId, operator.id, tenantId);
    if (previousStatus === "queued") {
      this.moveQueueWaitingToActive(conversation.channel, tenantId);
    }
    const assignmentJob = queueJob("assignment.commit", "routing-assignments");
    await this.saveJob(assignmentJob);
    if (action === "assign" || action === "transfer") {
      await this.routingRepository.saveRoutingAnalyticsRow({
        channel: conversation.channel,
        conversationId: conversation.id,
        eventKind: action === "transfer" ? "transfer" : "assignment",
        fromOperatorId: previousOperatorId,
        id: makeId(action === "transfer" ? "analytics_transfer" : "analytics_assignment"),
        occurredAt: new Date().toISOString(),
        source: "api",
        tenantId,
        toOperatorId: operator.id
      });
    }
    await this.persistState();

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
        realtimeEvent: realtimeEvent("routing.assignment.updated", conversation.id, tenantId, {
          action,
          fromStatus: previousStatus,
          toStatus: conversation.status
        })
      }
    });
  }

  async simulateAssignment(payload: AssignmentSimulationPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("simulateAssignment");
    }

    const conversation = this.findConversationForTenant(payload.conversationId, tenantId);
    if (!conversation) {
      return notFoundEnvelope("simulateAssignment", "conversation_not_found", `Conversation ${payload.conversationId} was not found.`, {
        conversationId: payload.conversationId
      });
    }

    const candidates = await this.buildAssignmentCandidates(conversation, tenantId);

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

  async previewRedistribution(payload: RedistributionPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("previewRedistribution");
    }

    const normalized = this.normalizeRedistributionPayload(payload, "previewRedistribution");
    if ("error" in normalized) {
      return normalized.error;
    }

    const preview = await this.buildRedistributionPlan(normalized.value, tenantId);

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "previewRedistribution",
      traceId: routingTraceId("previewRedistribution"),
      meta: apiMeta({ selectedQueues: normalized.value.selectedQueues, targetRule: normalized.value.targetRule }),
      data: {
        ...preview,
        auditRequired: true,
        mode: "preview",
        readyToCommit: preview.plan.length > 0 && preview.capacityConflicts.length === 0,
        redistributionId: redistributionIdFromKey(normalized.value.idempotencyKey)
      }
    });
  }

  async commitRedistribution(payload: RedistributionPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("commitRedistribution");
    }

    const normalized = this.normalizeRedistributionPayload(payload, "commitRedistribution");
    if ("error" in normalized) {
      return normalized.error;
    }

    const redistributionId = redistributionIdFromKey(normalized.value.idempotencyKey);
    const jobId = redistributionJobIdFromKey(normalized.value.idempotencyKey);
    const existingJob = (await this.routingRepository.listJobs()).find((job) => job.id === jobId);
    if (existingJob?.status === "committed") {
      const appliedAssignments = Array.isArray(existingJob.appliedAssignments) ? existingJob.appliedAssignments : [];
      return createEnvelope({
        service: ROUTING_SERVICE,
        operation: "commitRedistribution",
        traceId: routingTraceId("commitRedistribution"),
        meta: apiMeta({ idempotent: true, selectedQueues: normalized.value.selectedQueues }),
        data: {
          appliedAssignments,
          auditEvent: existingJob.auditEvent ?? auditEvent("routing_redistribution", "routing.redistribution.commit", normalized.value.reason),
          idempotent: true,
          mode: "commit",
          queueJob: clone(existingJob),
          redistributionId,
          status: "committed"
        }
      });
    }

    const preview = await this.buildRedistributionPlan(normalized.value, tenantId);
    if (preview.capacityConflicts.length > 0) {
      return conflictEnvelope("commitRedistribution", "redistribution_capacity_conflict", "Batch redistribution cannot be committed because at least one queued conversation has no eligible operator capacity.", {
        ...preview,
        mode: "commit",
        redistributionId
      });
    }

    if (preview.plan.length === 0) {
      return conflictEnvelope("commitRedistribution", "redistribution_empty_plan", "No queued conversations matched the selected queues.", {
        ...preview,
        mode: "commit",
        redistributionId
      });
    }

    const appliedAssignments = preview.plan.map((assignment) => {
      const conversation = this.findConversationForTenant(String(assignment.conversationId), tenantId);
      const operator = this.findOperatorForTenant(String(assignment.targetOperatorId), tenantId);
      if (!conversation || !operator) {
        throw new Error(`redistribution_plan_stale:${assignment.conversationId}:${assignment.targetOperatorId}`);
      }

      const previousOperatorId = conversation.operatorId ?? null;
      const previousStatus = conversation.status;
      conversation.operatorId = operator.id;
      conversation.status = "assigned";
      conversation.slaTone = conversation.slaTone === "closed" ? "ok" : conversation.slaTone;
      this.moveOperatorAssignment(previousOperatorId, operator.id, tenantId);
      if (previousStatus === "queued") {
        this.moveQueueWaitingToActive(conversation.channel, tenantId);
      }

      return {
        action: "assign",
        channel: conversation.channel,
        conversationId: conversation.id,
        fromOperatorId: previousOperatorId,
        previousStatus,
        targetOperatorId: operator.id
      };
    });
    const audit = auditEvent("routing_redistribution", "routing.redistribution.commit", normalized.value.reason);
    const assignmentJob = await this.saveJob({
      action: "redistribute",
      appliedAssignments,
      auditEvent: audit,
      id: jobId,
      kind: "redistribution.commit",
      queue: "routing-assignments",
      redistributionId,
      selectedQueues: normalized.value.selectedQueues,
      status: "committed"
    });
    for (const assignment of appliedAssignments) {
      await this.routingRepository.saveRoutingAnalyticsRow({
        channel: assignment.channel,
        conversationId: assignment.conversationId,
        eventKind: "assignment",
        fromOperatorId: assignment.fromOperatorId,
        id: makeId("analytics_redistribution"),
        occurredAt: new Date().toISOString(),
        source: "redistribution_batch",
        tenantId,
        toOperatorId: assignment.targetOperatorId
      });
    }
    await this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "commitRedistribution",
      traceId: routingTraceId("commitRedistribution"),
      meta: apiMeta({ selectedQueues: normalized.value.selectedQueues, targetRule: normalized.value.targetRule }),
      data: {
        ...preview,
        appliedAssignments,
        auditEvent: audit,
        mode: "commit",
        queueJob: assignmentJob,
        realtimeEvent: realtimeEvent("routing.redistribution.committed", redistributionId, tenantId, {
          appliedCount: appliedAssignments.length,
          selectedQueues: normalized.value.selectedQueues
        }),
        redistributionId,
        status: "committed"
      }
    });
  }

  async pauseSla(payload: SlaPausePayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("pauseSla");
    }

    const conversation = this.findConversationForTenant(payload.conversationId, tenantId);

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
    await this.saveJob(schedulerJob);
    await this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "pauseSla",
      traceId: routingTraceId("pauseSla"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("sla", "sla.pause", payload.reason),
        conversation: clone(conversation),
        realtimeEvent: realtimeEvent("sla.paused", conversation.id, tenantId, {
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

  async startRescue(payload: RescueStartPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("startRescue");
    }

    const conversation = this.findConversationForTenant(payload.conversationId, tenantId);

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
    this.moveOperatorRescueActive(conversation.operatorId ?? null, 1, tenantId);
    if (previousStatus === "queued") {
      this.moveQueueWaitingToActive(conversation.channel, tenantId);
    }
    const schedulerJob = {
      id: makeId("job_rescue_return"),
      action: "return_to_sla_queue",
      conversationId: conversation.id,
      queue: "rescue-return",
      runAt: rescue.deadlineAt,
      tenantId
    };
    await this.saveJob(schedulerJob);
    await this.routingRepository.saveRoutingAnalyticsRow({
      channel: conversation.channel,
      conversationId: conversation.id,
      eventKind: "rescue",
      fromOperatorId: null,
      id: makeId("analytics_rescue"),
      occurredAt: new Date().toISOString(),
      source: rescue.source,
      tenantId,
      toOperatorId: conversation.operatorId ?? null
    });
    await this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "startRescue",
      traceId: routingTraceId("startRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.start", rescue.reason),
        conversation: clone(conversation),
        queuePriority: "rescue",
        realtimeEvent: realtimeEvent("rescue.started", conversation.id, tenantId, {
          deadlineAt: rescue.deadlineAt,
          durationSeconds: rescue.durationSeconds
        }),
        reportEvent: reportEvent("rescue.started", "active"),
        rescue: clone(rescue),
        schedulerJob
      }
    });
  }

  async resolveRescue(payload: RescueResolvePayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("resolveRescue");
    }

    const conversation = this.findConversationForTenant(payload.conversationId, tenantId);

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
      this.moveOperatorAssignment(previousOperatorId, null, tenantId);
      conversation.status = "queued";
      conversation.operatorId = undefined;
      conversation.slaTone = outcome === "missed" ? "danger" : "hold";
      if (previousStatus !== "queued") {
        this.moveQueueActiveToWaiting(conversation.channel, tenantId);
      }
    } else {
      conversation.status = "active";
      conversation.slaTone = "ok";
    }
    this.moveOperatorRescueActive(previousOperatorId, -1, tenantId);

    this.rescueReportRows.push({
      conversationId: conversation.id,
      channel: conversation.channel,
      operatorId: previousOperatorId,
      timerSeconds: conversation.rescue.durationSeconds,
      reason: conversation.rescue.reason,
      outcome,
      resolution: payload.reason?.trim() || "Resolved by operator",
      tenantId,
      digest: "daily_rescue"
    });
    const rescueReturnJob = outcome === "returned_to_queue" || outcome === "missed"
      ? {
          ...queueJob("rescue.return_queue", "rescue-return"),
          action: "return_to_sla_queue",
          conversationId: conversation.id,
          status: "pending",
          tenantId
        }
      : null;
    if (rescueReturnJob) {
      await this.saveJob(rescueReturnJob);
    }
    await this.persistState();

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "resolveRescue",
      traceId: routingTraceId("resolveRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.resolve", payload.reason),
        conversation: clone(conversation),
        queueJob: rescueReturnJob,
        realtimeEvent: realtimeEvent("rescue.resolved", conversation.id, tenantId, { outcome }),
        reportEvent: reportEvent("rescue.report.ready", outcome),
        rescue: clone(conversation.rescue)
      }
    });
  }

  async fetchRescueReport(filters: RescueReportFilters = {}, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("fetchRescueReport");
    }

    const rows = clone(this.rescueReportRows.filter((row) => this.rescueReportRowBelongsToTenant(row, tenantId)));
    const outcomeSummary = summarizeOutcomes(rows);
    const routingAnalyticsRows = (await this.routingRepository.listRoutingAnalyticsRows({ tenantId }))
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
        routingAnalytics: routingAnalyticsProjection(routingAnalyticsRows, undefined, tenantId),
        rows
      }
    });
  }

  private normalizeRedistributionPayload(
    payload: RedistributionPayload,
    operation: "commitRedistribution" | "previewRedistribution"
  ): { value: Required<Pick<RedistributionPayload, "idempotencyKey" | "reason" | "selectedQueues" | "targetRule">> & { previewId?: string } } | { error: BackendEnvelope<Record<string, unknown>> } {
    const idempotencyKey = String(payload.idempotencyKey ?? "").trim();
    if (idempotencyKey.length < 8) {
      return {
        error: invalidEnvelope(operation, "redistribution_idempotency_key_required", "A redistribution idempotency key of at least 8 characters is required.", {
          idempotencyKey: idempotencyKey || null
        })
      };
    }

    if (!hasReason(payload.reason)) {
      return {
        error: invalidEnvelope(operation, "redistribution_reason_required", "A redistribution reason of at least 8 characters is required.", {
          idempotencyKey
        })
      };
    }

    const selectedQueues = normalizeSelectedQueues(payload.selectedQueues);
    if (selectedQueues.length === 0) {
      return {
        error: invalidEnvelope(operation, "redistribution_queues_required", "At least one routing queue must be selected for redistribution.", {
          idempotencyKey
        })
      };
    }

    const targetRule = String(payload.targetRule ?? "least_loaded").trim() || "least_loaded";
    if (targetRule !== "least_loaded") {
      return {
        error: invalidEnvelope(operation, "redistribution_rule_unsupported", `Redistribution rule ${targetRule} is not supported.`, {
          idempotencyKey,
          supportedRules: ["least_loaded"],
          targetRule
        })
      };
    }

    return {
      value: {
        idempotencyKey,
        previewId: payload.previewId?.trim(),
        reason: payload.reason!.trim(),
        selectedQueues,
        targetRule
      }
    };
  }

  private async buildRedistributionPlan(
    payload: Required<Pick<RedistributionPayload, "idempotencyKey" | "reason" | "selectedQueues" | "targetRule">>,
    tenantId: string
  ): Promise<RedistributionPlan> {
    const selectedQueues = new Set(payload.selectedQueues);
    const tenantQueues = this.queues.filter((queue) => this.queueBelongsToTenant(queue, tenantId));
    const knownQueueIds = new Set(tenantQueues.map((queue) => queue.channel));
    const missingQueues = payload.selectedQueues.filter((queue) => !knownQueueIds.has(queue));
    const plannedOperatorLoad = new Map<string, number>();
    const plan: RedistributionPlanAssignment[] = [];
    const capacityConflicts: Array<Record<string, unknown>> = missingQueues.map((queue) => ({
      code: "queue_not_found",
      queue
    }));
    const queuedConversations = this.conversations
      .filter((conversation) => this.conversationBelongsToTenant(conversation, tenantId))
      .filter((conversation) => selectedQueues.has(conversation.channel))
      .filter((conversation) => conversation.status === "queued")
      .sort(compareRedistributionConversations);

    for (const conversation of queuedConversations) {
      const candidates = await this.buildAssignmentCandidates(conversation, tenantId, plannedOperatorLoad);
      const candidate = candidates.find((item) => item.recommendation === "eligible");
      if (!candidate) {
        capacityConflicts.push({
          channel: conversation.channel,
          code: "no_eligible_operator",
          conversationId: conversation.id,
          reasons: candidates.slice(0, 3).map((item) => ({
            explain: item.explain,
            operatorId: item.operatorId,
            recommendation: item.recommendation
          }))
        });
        continue;
      }

      const operatorId = String(candidate.operatorId);
      const operator = this.findOperatorForTenant(operatorId, tenantId);
      plannedOperatorLoad.set(operatorId, (plannedOperatorLoad.get(operatorId) ?? 0) + 1);
      plan.push({
        action: "assign",
        availableCapacityBefore: candidate.availableCapacity,
        channel: conversation.channel,
        conversationId: conversation.id,
        loadRatioBefore: candidate.loadRatio,
        previousOperatorId: conversation.operatorId ?? null,
        slaTone: conversation.slaTone,
        targetOperatorId: operatorId,
        targetOperatorName: operator?.name ?? operatorId
      });
    }

    return {
      capacityConflicts,
      plan,
      selectedQueues: payload.selectedQueues,
      slaImpact: {
        queuedDialogsAssigned: plan.length,
        queuesTouched: payload.selectedQueues.length,
        riskDialogsIncluded: queuedConversations.filter((conversation) => conversation.slaTone === "danger" || conversation.slaTone === "warn").length
      },
      targetRule: payload.targetRule
    };
  }

  private async buildAssignmentCandidates(
    conversation: RoutingConversation,
    tenantId: string,
    plannedOperatorLoad: Map<string, number> = new Map()
  ): Promise<Array<Record<string, unknown>>> {
    const memberships = await this.listActiveQueueMemberships(conversation.channel, tenantId);
    const capacities = await this.listOperatorCapacities(conversation.channel, tenantId);
    return this.operators
      .filter((operator) => this.operatorBelongsToTenant(operator, tenantId))
      .map((operator) => {
        const capacity = findCapacityForOperator(capacities, operator.id, conversation.channel);
        const queueMembership = findMembershipForOperator(memberships, operator.id, conversation.channel);
        const chatLimit = capacity?.chatLimit ?? operator.limit;
        const plannedChats = operator.chats + (plannedOperatorLoad.get(operator.id) ?? 0);
        const channelAccess = this.operatorCanAccessChannel(operator, conversation.channel, memberships);
        const availableCapacity = Math.max(0, chatLimit - plannedChats);
        const online = operator.status === "online";
        const explain = [
          channelAccess ? "channel_access:granted" : "channel_access:denied",
          `status:${operator.status}`,
          availableCapacity > 0 ? "capacity:available" : "capacity:full"
        ];

        return {
          operatorId: operator.id,
          status: operator.status,
          chats: plannedChats,
          chatLimit,
          availableCapacity,
          channelAccess,
          explain,
          loadRatio: chatLimit > 0 ? Number((plannedChats / chatLimit).toFixed(2)) : 1,
          queueMembership: hasMembershipChannelAccess(memberships, operator.id, conversation.channel),
          queueMembershipRole: queueMembership?.role ?? null,
          recommendation: channelAccess && online && availableCapacity > 0 ? "eligible" : "blocked"
        };
      }).sort(compareAssignmentCandidates);
  }

  private async returnConversationToQueue(conversation: RoutingConversation, tenantId: string, reason?: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const previousOperatorId = conversation.operatorId ?? null;
    const previousStatus = conversation.status;
    conversation.operatorId = undefined;
    conversation.status = "queued";
    conversation.slaTone = conversation.slaTone === "danger" ? "danger" : "hold";
    this.moveOperatorAssignment(previousOperatorId, null, tenantId);
    if (previousStatus !== "queued") {
      this.moveQueueActiveToWaiting(conversation.channel, tenantId);
    }
    const assignmentJob = queueJob("assignment.return_queue", "routing-assignments");
    await this.saveJob(assignmentJob);
    await this.persistState();

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
        realtimeEvent: realtimeEvent("routing.assignment.updated", conversation.id, tenantId, {
          action: "return_queue",
          toStatus: conversation.status
        })
      }
    });
  }

  private moveOperatorAssignment(previousOperatorId: string | null, nextOperatorId: string | null, tenantId: string): void {
    if (previousOperatorId && previousOperatorId !== nextOperatorId) {
      const previousOperator = this.findOperatorForTenant(previousOperatorId, tenantId);
      if (previousOperator) {
        previousOperator.chats = Math.max(0, previousOperator.chats - 1);
      }
    }

    if (nextOperatorId && previousOperatorId !== nextOperatorId) {
      const nextOperator = this.findOperatorForTenant(nextOperatorId, tenantId);
      if (nextOperator) {
        nextOperator.chats += 1;
      }
    }
  }

  private moveOperatorRescueActive(operatorId: string | null, delta: number, tenantId: string): void {
    if (!operatorId) {
      return;
    }

    const operator = this.findOperatorForTenant(operatorId, tenantId);
    if (operator) {
      operator.rescueActive = Math.max(0, operator.rescueActive + delta);
    }
  }

  private moveQueueWaitingToActive(channel: string, tenantId: string): void {
    const queue = this.findQueueForTenant(channel, tenantId);
    if (queue) {
      queue.waiting = Math.max(0, queue.waiting - 1);
      queue.active += 1;
    }
  }

  private filterQueues(channel: string | undefined, tenantId: string): RoutingQueue[] {
    return this.queues
      .filter((queue) => this.queueBelongsToTenant(queue, tenantId))
      .filter((queue) => !channel || queue.channel === channel);
  }

  private findConversation(conversationId: string): RoutingConversation | undefined {
    return this.conversations.find((conversation) => conversation.id === conversationId);
  }

  private findConversationForTenant(conversationId: string, tenantId: string): RoutingConversation | undefined {
    const conversation = this.findConversation(conversationId);
    return conversation && this.conversationBelongsToTenant(conversation, tenantId) ? conversation : undefined;
  }

  private findOperator(operatorId: string): RoutingOperator | undefined {
    return this.operators.find((operator) => operator.id === operatorId);
  }

  private findOperatorForTenant(operatorId: string, tenantId: string): RoutingOperator | undefined {
    const operator = this.findOperator(operatorId);
    return operator && this.operatorBelongsToTenant(operator, tenantId) ? operator : undefined;
  }

  private findQueueForTenant(channel: string, tenantId: string): RoutingQueue | undefined {
    return this.queues.find((queue) => queue.channel === channel && this.queueBelongsToTenant(queue, tenantId));
  }

  private moveQueueActiveToWaiting(channel: string, tenantId: string): void {
    const queue = this.findQueueForTenant(channel, tenantId);
    if (queue) {
      queue.active = Math.max(0, queue.active - 1);
      queue.waiting += 1;
    }
  }

  private async listActiveQueueMemberships(channel: string | undefined, tenantId: string): Promise<QueueMembershipRecord[]> {
    return this.routingRepository.listQueueMemberships({
      active: true,
      ...(channel ? { queueId: channel } : {}),
      tenantId
    });
  }

  private async listOperatorCapacities(channel: string | undefined, tenantId: string): Promise<OperatorCapacityRecord[]> {
    return this.routingRepository.listOperatorCapacities({
      ...(channel ? { channel } : {}),
      tenantId
    });
  }

  private async operatorHasChannelAccess(operator: RoutingOperator, channel: string, tenantId: string): Promise<boolean> {
    const memberships = await this.listActiveQueueMemberships(channel, tenantId);
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

  private async resolveRoutingPolicy(channel: string | undefined, tenantId: string): Promise<Record<string, unknown>> {
    const rules = await this.routingRepository.listRoutingRules({
      enabled: true,
      tenantId
    });
    const rule = findRoutingPolicyRule(rules, channel);

    return {
      limitMode: rule?.limitMode ?? "operator_channel_limit",
      priorityStrategy: rule?.priorityStrategy ?? "least_loaded",
      serverValidated: true,
      waitThresholdSeconds: rule?.waitThresholdSeconds ?? 180
    };
  }

  private operatorBelongsToTenant(operator: RoutingOperator, tenantId: string): boolean {
    return operator.tenantId === tenantId;
  }

  private conversationBelongsToTenant(conversation: RoutingConversation, tenantId: string): boolean {
    return conversation.tenantId === tenantId;
  }

  private queueBelongsToTenant(queue: RoutingQueue, tenantId: string): boolean {
    return queue.tenantId === tenantId;
  }

  private rescueReportRowBelongsToTenant(row: RescueReportRow, tenantId: string): boolean {
    return row.tenantId === tenantId;
  }

  private async persistState(): Promise<void> {
    const current = this.routingRepository.readState();
    await this.routingRepository.saveState({
      conversations: this.conversations,
      jobs: await this.routingRepository.listJobs(),
      operatorCapacities: current.operatorCapacities,
      operators: this.operators,
      queueMemberships: current.queueMemberships,
      queues: this.queues,
      routingAnalyticsRows: current.routingAnalyticsRows,
      rescueReportRows: this.rescueReportRows,
      routingRules: current.routingRules
    });
  }

  private async saveJob(job: Record<string, unknown>): Promise<RoutingJobDescriptor> {
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

function tenantContextRequiredEnvelope(operation: string): BackendEnvelope<Record<string, unknown>> {
  return invalidEnvelope(operation, "tenant_context_required", "Tenant context is required for routing operations.", {
    guard: "tenant_context_required",
    tenantId: null
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

function routingAnalyticsProjection(rows: RoutingAnalyticsRow[], channel: string | undefined, tenantId: string): Record<string, unknown> {
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
    tenantId,
    totalEvents: scopedRows.length
  };
}

function requiredTenantId(context: RoutingRequestContext = {}): string | null {
  const tenantId = String(context.tenantId ?? "").trim();
  return tenantId || null;
}

function normalizeSelectedQueues(selectedQueues: string[] | undefined): string[] {
  return Array.from(new Set((selectedQueues ?? []).map((queue) => String(queue).trim()).filter(Boolean)));
}

function redistributionIdFromKey(idempotencyKey: string): string {
  return `routing_redist_${sanitizeIdempotencyKey(idempotencyKey)}`;
}

function redistributionJobIdFromKey(idempotencyKey: string): string {
  return `job_routing_redist_${sanitizeIdempotencyKey(idempotencyKey)}`;
}

function sanitizeIdempotencyKey(idempotencyKey: string): string {
  const sanitized = idempotencyKey.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "request";
}

function compareRedistributionConversations(left: RoutingConversation, right: RoutingConversation): number {
  const leftRisk = redistributionRiskRank(left.slaTone);
  const rightRisk = redistributionRiskRank(right.slaTone);
  if (leftRisk !== rightRisk) {
    return leftRisk - rightRisk;
  }

  return left.id.localeCompare(right.id);
}

function redistributionRiskRank(slaTone: RoutingConversation["slaTone"]): number {
  if (slaTone === "danger") {
    return 0;
  }
  if (slaTone === "warn") {
    return 1;
  }
  if (slaTone === "hold") {
    return 2;
  }
  return 3;
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

function realtimeEvent(eventName: string, resourceId: string, tenantId: string, data: Record<string, unknown>): Record<string, unknown> {
  return {
    eventId: makeId("rt_routing"),
    eventName,
    occurredAt: new Date().toISOString(),
    resourceId,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId,
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
