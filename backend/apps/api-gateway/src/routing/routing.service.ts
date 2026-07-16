import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { OperatorPresenceRepository } from "../presence/operator-presence.repository.js";
import type { OperatorPresenceCurrentRecord } from "../presence/operator-presence.types.js";
import { presenceAcceptsAutoAssignment, presenceAcceptsManualAssignment } from "../presence/operator-presence.types.js";
import type { RescueReportRow, RoutingConversation, RoutingOperator, RoutingQueue, RoutingRescueState } from "./routing.types.js";
import { CanonicalRoutingConversationRepository, type CanonicalRoutingConversation } from "./canonical-routing-conversation.repository.js";
import { CanonicalRoutingWorkloadAdapter } from "./canonical-routing-workload.adapter.js";
import {
  RoutingRepository,
  type OperatorCapacityRecord,
  type QueueMembershipRecord,
  type RoutingAnalyticsRow,
  type RoutingJobDescriptor,
  type RoutingLifecycleEvent,
  type RoutingRuleRecord,
  type RoutingState
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
  actorId?: string;
  actorName?: string;
  actorType?: "operator" | "service_admin";
  tenantId?: string;
}

export class RoutingService {
  private conversations: RoutingConversation[];
  private operators: RoutingOperator[];
  private queues: RoutingQueue[];
  private rescueReportRows: RescueReportRow[];

  constructor(
    private readonly routingRepository = RoutingRepository.default(),
    private readonly canonicalWorkload?: CanonicalRoutingWorkloadAdapter,
    private readonly canonicalConversations?: CanonicalRoutingConversationRepository,
    private readonly canonicalTeams?: TeamDirectoryRepository,
    private readonly operatorPresence: Pick<OperatorPresenceRepository, "findCurrent" | "listCurrent"> = OperatorPresenceRepository.default()
  ) {
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
    const canonical = this.canonicalWorkload ? await this.canonicalWorkload.readWorkload(tenantId) : null;
    const queues = canonical
      ? canonical.queues.filter((queue) => !channel || queue.queueId === channel || queue.transportChannels.includes(channel))
      : this.filterQueues(channel, tenantId);
    const memberships = await this.listActiveQueueMemberships(channel, tenantId);
    const capacities = await this.listOperatorCapacities(channel, tenantId);
    const routingPolicy = await this.resolveRoutingPolicy(channel, tenantId);
    const routingAnalyticsRows = await this.routingRepository.listRoutingAnalyticsRows({ tenantId });
    const visibleQueueIds = new Set(queues.map((queue) => queue.channel));
    const presenceByOperator = await this.listOperatorPresence(tenantId);
    const operatorSource = (canonical
      ? canonical.operators.filter((operator) => !channel || operator.queueIds.some((queueId) => visibleQueueIds.has(queueId)))
      : this.operators
        .filter((operator) => this.operatorBelongsToTenant(operator, tenantId))
        .filter((operator) => this.operatorCanAccessChannel(operator, channel, memberships)))
      .map((operator) => withOperatorPresence(operator, presenceByOperator.get(operator.id)));
    const operators = operatorSource
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
        dataQuality: canonical ? {
          canonical: true,
          operatorPresence: presenceQualityLabel(operatorSource),
          queueMetrics: "canonical_conversations"
        } : { canonical: false },
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

    const canonicalConversation = await this.hydrateCanonicalRoutingState(tenantId, payload.conversationId);
    const conversation = canonicalConversation
      ? clone(canonicalConversation)
      : this.findConversationForTenant(payload.conversationId, tenantId);
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
      return this.returnConversationToQueue(conversation, tenantId, payload.reason, context, canonicalConversation);
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

    const presenceAwareOperator = withOperatorPresence(operator, await this.findOperatorPresence(tenantId, operator.id));
    if (!operatorAcceptsManualAssignment(presenceAwareOperator)) {
      return deniedEnvelope("createAssignment", "operator_unavailable", "Operator status does not allow new dialog assignments.", {
        guard: "operator_channel_limit",
        operatorId: operator.id,
        operatorStatus: presenceAwareOperator.status
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
    const assignedTeamId = canonicalConversation && this.canonicalTeams
      ? await this.canonicalTeams.findActiveTeamId(tenantId, operator.id)
      : undefined;
    conversation.operatorId = operator.id;
    if (assignedTeamId) conversation.teamId = assignedTeamId;
    conversation.status = action === "transfer" ? "transferred" : "assigned";
    conversation.slaTone = conversation.slaTone === "closed" ? "ok" : conversation.slaTone;
    this.moveOperatorAssignment(previousOperatorId, operator.id, tenantId);
    if (previousStatus === "queued") {
      this.moveQueueWaitingToActive(conversation.channel, tenantId);
    }
    const assignmentJob = queueJob("assignment.commit", "routing-assignments");
    const analyticsRows: RoutingAnalyticsRow[] = [];
    if (action === "assign" || action === "transfer") {
      analyticsRows.push({
        channel: canonicalConversation?.sourceChannel ?? conversation.channel,
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
    const lifecycleEvent = routingLifecycleEvent({
        context,
        conversationId: conversation.id,
        data: { action, fromOperatorId: previousOperatorId, fromStatus: previousStatus, queueId: conversation.channel, toOperatorId: operator.id, toStatus: conversation.status },
        eventType: "assignment.changed",
        reason: payload.reason,
        sourceEventId: `${assignmentJob.id}:${action}`
      });
    const assignmentRealtimeEvent = realtimeEvent("routing.assignment.updated", conversation.id, tenantId, {
      action,
      fromStatus: previousStatus,
      toStatus: conversation.status
    });
    if (canonicalConversation) {
      await this.persistManualTransition({
        action,
        analyticsRows,
        canonicalConversation,
        conversation,
        events: [lifecycleEvent],
        jobs: [assignmentJob],
        operatorName: operator.name,
        realtimeEvent: assignmentRealtimeEvent,
        teamId: assignedTeamId ?? null,
        tenantId
      });
    } else {
      await this.persistState({ analyticsRows, events: [lifecycleEvent], jobs: [assignmentJob] });
    }

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
        realtimeEvent: assignmentRealtimeEvent
      }
    });
  }

  async simulateAssignment(payload: AssignmentSimulationPayload, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) {
      return tenantContextRequiredEnvelope("simulateAssignment");
    }

    const canonicalConversation = await this.hydrateCanonicalRoutingState(tenantId, payload.conversationId);
    const conversation = canonicalConversation ? clone(canonicalConversation) : this.findConversationForTenant(payload.conversationId, tenantId);
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

  async autoAssignConversation(conversationId: string, context: RoutingRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requiredTenantId(context);
    if (!tenantId) return tenantContextRequiredEnvelope("autoAssignConversation");
    const conversation = await this.hydrateCanonicalRoutingState(tenantId, conversationId);
    if (!conversation) {
      return notFoundEnvelope("autoAssignConversation", "conversation_not_found", `Conversation ${conversationId} was not found.`, { conversationId });
    }
    if (conversation.operatorId) {
      return createEnvelope({
        service: ROUTING_SERVICE,
        operation: "autoAssignConversation",
        traceId: routingTraceId("autoAssignConversation"),
        meta: apiMeta({ idempotent: true }),
        data: { assigned: true, conversationId, idempotent: true, operatorId: conversation.operatorId }
      });
    }
    const candidates = await this.buildAssignmentCandidates(conversation, tenantId);
    const candidate = candidates.find((item) => item.recommendation === "eligible");
    if (!candidate) {
      // Свободных операторов нет: диалог реально возвращается в очередь
      // (status queued + queue.entered), иначе после handoff бота он
      // остается «в работе» и не виден во вкладке «Ожидают».
      let queuedConversation: Record<string, unknown> | undefined;
      if (conversation.status !== "queued" && conversation.status !== "closed") {
        const returned = await this.returnConversationToQueue(
          clone(conversation),
          tenantId,
          "No eligible operator available for automatic assignment",
          context,
          conversation
        );
        if (returned.status === "ok") {
          queuedConversation = returned.data.conversation as Record<string, unknown>;
        }
      }
      return createEnvelope({
        service: ROUTING_SERVICE,
        operation: "autoAssignConversation",
        traceId: routingTraceId("autoAssignConversation"),
        meta: apiMeta({ reason: "no_eligible_operator" }),
        data: {
          assigned: false,
          candidates,
          conversationId,
          queued: true,
          ...(queuedConversation ? { conversation: queuedConversation } : {})
        }
      });
    }
    return this.createAssignment({
      action: "assign",
      conversationId,
      reason: "Automatic least-loaded queue assignment",
      targetOperatorId: String(candidate.operatorId)
    }, context);
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

    await this.hydrateCanonicalRoutingState(tenantId);
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

    await this.hydrateCanonicalRoutingState(tenantId);
    const canonicalById = new Map(this.conversations
      .filter((conversation): conversation is CanonicalRoutingConversation => conversation.tenantId === tenantId && "persistedStatus" in conversation)
      .map((conversation) => [conversation.id, clone(conversation)]));
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

    const appliedAssignments: Array<Record<string, any>> = [];
    const batchTransitions: Array<{
      conversationId: string;
      expectedOperatorId: string | null;
      expectedStatus: string;
      operatorId: string;
      operatorName: string;
      slaTone: string;
      status: string;
      teamId?: string | null;
    }> = [];
    for (const assignment of preview.plan) {
      const conversation = this.findConversationForTenant(String(assignment.conversationId), tenantId);
      const operator = this.findOperatorForTenant(String(assignment.targetOperatorId), tenantId);
      if (!conversation || !operator) {
        throw new Error(`redistribution_plan_stale:${assignment.conversationId}:${assignment.targetOperatorId}`);
      }

      const previousOperatorId = conversation.operatorId ?? null;
      const previousStatus = conversation.status;
      const canonical = canonicalById.get(conversation.id);
      const assignedTeamId = canonical && this.canonicalTeams ? await this.canonicalTeams.findActiveTeamId(tenantId, operator.id) : undefined;
      conversation.operatorId = operator.id;
      if (assignedTeamId) conversation.teamId = assignedTeamId;
      conversation.status = "assigned";
      conversation.slaTone = conversation.slaTone === "closed" ? "ok" : conversation.slaTone;
      this.moveOperatorAssignment(previousOperatorId, operator.id, tenantId);
      if (previousStatus === "queued") {
        this.moveQueueWaitingToActive(conversation.channel, tenantId);
      }

      appliedAssignments.push({
        action: "assign",
        channel: canonical?.sourceChannel ?? conversation.channel,
        conversationId: conversation.id,
        fromOperatorId: previousOperatorId,
        previousStatus,
        targetOperatorId: operator.id
      });
      if (canonical) {
        batchTransitions.push({
          conversationId: conversation.id,
          expectedOperatorId: canonical.operatorId ?? null,
          expectedStatus: canonical.persistedStatus,
          operatorId: operator.id,
          operatorName: operator.name,
          slaTone: conversation.slaTone,
          status: conversation.status,
          ...(assignedTeamId !== undefined ? { teamId: assignedTeamId } : {})
        });
      }
    }
    const audit = auditEvent("routing_redistribution", "routing.redistribution.commit", normalized.value.reason);
    const assignmentJob: RoutingJobDescriptor = {
      action: "redistribute",
      appliedAssignments,
      auditEvent: audit,
      id: jobId,
      kind: "redistribution.commit",
      queue: "routing-assignments",
      redistributionId,
      selectedQueues: normalized.value.selectedQueues,
      status: "committed"
    };
    const analyticsRows: RoutingAnalyticsRow[] = [];
    const lifecycleEvents: RoutingLifecycleEvent[] = [];
    const realtimeEvents: RealtimeEvent[] = [];
    for (const assignment of appliedAssignments) {
      analyticsRows.push({
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
      lifecycleEvents.push(routingLifecycleEvent({
        context,
        conversationId: assignment.conversationId,
        data: { action: "assign", fromOperatorId: assignment.fromOperatorId, fromStatus: assignment.previousStatus, queueId: assignment.channel, redistributionId, toOperatorId: assignment.targetOperatorId, toStatus: "assigned" },
        eventType: "assignment.changed",
        reason: normalized.value.reason,
        sourceEventId: `${jobId}:${assignment.conversationId}:assign`
      }));
      realtimeEvents.push(realtimeEvent("routing.assignment.updated", assignment.conversationId, tenantId, {
        action: "assign",
        redistributionId,
        targetOperatorId: assignment.targetOperatorId
      }));
    }
    if (batchTransitions.length === appliedAssignments.length) {
      await this.persistBatchTransition({ analyticsRows, batchTransitions, events: lifecycleEvents, jobs: [assignmentJob], realtimeEvents, tenantId });
    } else {
      await this.persistState({ analyticsRows, events: lifecycleEvents, jobs: [assignmentJob] });
    }

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

    const canonicalConversation = await this.hydrateCanonicalRoutingState(tenantId, payload.conversationId);
    const conversation = canonicalConversation ? clone(canonicalConversation) : this.findConversationForTenant(payload.conversationId, tenantId);

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
    const previousStatus = conversation.status;
    conversation.status = "paused";
    conversation.slaTone = "hold";
    const pausedUntil = addMinutes(durationMinutes);
    const schedulerJob: RoutingJobDescriptor = {
      id: makeId("job_sla_resume"),
      action: "resume_sla",
      conversationId: conversation.id,
      queue: "sla-timers",
      runAt: pausedUntil.toISOString(),
      status: "pending",
      tenantId
    };
    const lifecycleEvent = routingLifecycleEvent({
        context,
        conversationId: conversation.id,
        data: { durationMinutes, fromStatus: previousStatus, pausedUntil: pausedUntil.toISOString(), toStatus: "paused" },
        eventType: "sla.paused",
        reason: payload.reason,
        sourceEventId: `${schedulerJob.id}:pause_sla`
      });
    const slaRealtimeEvent = realtimeEvent("sla.paused", conversation.id, tenantId, {
      durationMinutes,
      reason: payload.reason
    });
    if (canonicalConversation) {
      await this.persistManualTransition({ action: "pause_sla", canonicalConversation, conversation, events: [lifecycleEvent], jobs: [schedulerJob], realtimeEvent: slaRealtimeEvent, tenantId });
    } else {
      await this.persistState({ events: [lifecycleEvent], jobs: [schedulerJob] });
    }

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "pauseSla",
      traceId: routingTraceId("pauseSla"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("sla", "sla.pause", payload.reason),
        conversation: clone(conversation),
        realtimeEvent: slaRealtimeEvent,
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

    const canonicalConversation = await this.hydrateCanonicalRoutingState(tenantId, payload.conversationId);
    const conversation = canonicalConversation ? clone(canonicalConversation) : this.findConversationForTenant(payload.conversationId, tenantId);

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
    const schedulerJob: RoutingJobDescriptor = {
      id: makeId("job_rescue_return"),
      action: "return_to_sla_queue",
      conversationId: conversation.id,
      queue: "rescue-return",
      runAt: rescue.deadlineAt,
      status: "pending",
      tenantId
    };
    const rescueAnalytics: RoutingAnalyticsRow = {
      channel: canonicalConversation?.sourceChannel ?? conversation.channel,
      conversationId: conversation.id,
      eventKind: "rescue",
      fromOperatorId: null,
      id: makeId("analytics_rescue"),
      occurredAt: new Date().toISOString(),
      source: rescue.source,
      tenantId,
      toOperatorId: conversation.operatorId ?? null
    };
    const lifecycleEvent = routingLifecycleEvent({
        context,
        conversationId: conversation.id,
        data: { deadlineAt: rescue.deadlineAt, durationSeconds: rescue.durationSeconds, fromStatus: previousStatus, source: rescue.source, toStatus: conversation.status },
        eventType: "rescue.started",
        reason: rescue.reason,
        sourceEventId: `${schedulerJob.id}:start_rescue`
      });
    const rescueRealtimeEvent = realtimeEvent("rescue.started", conversation.id, tenantId, {
      deadlineAt: rescue.deadlineAt,
      durationSeconds: rescue.durationSeconds
    });
    if (canonicalConversation) {
      await this.persistManualTransition({ action: "start_rescue", analyticsRows: [rescueAnalytics], canonicalConversation, conversation, events: [lifecycleEvent], jobs: [schedulerJob], realtimeEvent: rescueRealtimeEvent, tenantId });
    } else {
      await this.persistState({ analyticsRows: [rescueAnalytics], events: [lifecycleEvent], jobs: [schedulerJob] });
    }

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "startRescue",
      traceId: routingTraceId("startRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.start", rescue.reason),
        conversation: clone(conversation),
        queuePriority: "rescue",
        realtimeEvent: rescueRealtimeEvent,
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

    const canonicalConversation = await this.hydrateCanonicalRoutingState(tenantId, payload.conversationId);
    const conversation = canonicalConversation ? clone(canonicalConversation) : this.findConversationForTenant(payload.conversationId, tenantId);

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
    const pendingRescueReturnJob = (await this.routingRepository.listJobs()).find((job) =>
      job.queue === "rescue-return"
      && job.action === "return_to_sla_queue"
      && job.conversationId === conversation.id
      && job.tenantId === tenantId
      && (job.status === "pending" || job.status === "claimed")
    );
    const rescueReturnJob: RoutingJobDescriptor | null = pendingRescueReturnJob
      ? {
          ...pendingRescueReturnJob,
          completedAt: new Date().toISOString(),
          leaseExpiresAt: undefined,
          leaseOwner: undefined,
          status: "canceled"
        }
      : null;
    const resolutionEventId = rescueReturnJob?.id ?? makeId("rescue_resolution");
    const lifecycleEvent = routingLifecycleEvent({
        context,
        conversationId: conversation.id,
        data: { fromOperatorId: previousOperatorId, outcome, toOperatorId: conversation.operatorId ?? null, toStatus: conversation.status },
        eventType: "rescue.resolved",
        reason: payload.reason,
        sourceEventId: `${resolutionEventId}:resolve_rescue`
      });
    const rescueRealtimeEvent = realtimeEvent("rescue.resolved", conversation.id, tenantId, { outcome });
    if (canonicalConversation) {
      await this.persistManualTransition({
        action: "resolve_rescue",
        canonicalConversation,
        conversation,
        events: [lifecycleEvent],
        jobs: rescueReturnJob ? [rescueReturnJob] : [],
        ...(outcome === "returned_to_queue" || outcome === "missed" ? { queueId: canonicalConversation.queueId } : {}),
        realtimeEvent: rescueRealtimeEvent,
        tenantId
      });
    } else {
      await this.persistState({ events: [lifecycleEvent], jobs: rescueReturnJob ? [rescueReturnJob] : [] });
    }

    return createEnvelope({
      service: ROUTING_SERVICE,
      operation: "resolveRescue",
      traceId: routingTraceId("resolveRescue"),
      meta: apiMeta({ conversationId: conversation.id }),
      data: {
        auditEvent: auditEvent("rescue", "rescue.resolve", payload.reason),
        conversation: clone(conversation),
        queueJob: rescueReturnJob,
        realtimeEvent: rescueRealtimeEvent,
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
    const presenceByOperator = await this.listOperatorPresence(tenantId);
    return this.operators
      .filter((operator) => this.operatorBelongsToTenant(operator, tenantId))
      .map((operator) => withOperatorPresence(operator, presenceByOperator.get(operator.id)))
      .map((operator) => {
        const capacity = findCapacityForOperator(capacities, operator.id, conversation.channel);
        const queueMembership = findMembershipForOperator(memberships, operator.id, conversation.channel);
        const chatLimit = capacity?.chatLimit ?? operator.limit;
        const plannedChats = operator.chats + (plannedOperatorLoad.get(operator.id) ?? 0);
        const channelAccess = this.operatorCanAccessChannel(operator, conversation.channel, memberships);
        const availableCapacity = Math.max(0, chatLimit - plannedChats);
        const online = operatorAcceptsAutoAssignment(operator);
        const explain = [
          channelAccess ? "channel_access:granted" : "channel_access:denied",
          `status:${operator.status}`,
          `presence:${operator.presenceSource ?? operator.availability?.source ?? "routing_store"}`,
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

  private async returnConversationToQueue(
    conversation: RoutingConversation,
    tenantId: string,
    reason: string | undefined,
    context: RoutingRequestContext,
    canonicalConversation?: CanonicalRoutingConversation
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
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
    const lifecycleEvent = routingLifecycleEvent({
        context,
        conversationId: conversation.id,
        data: { action: "return_queue", fromOperatorId: previousOperatorId, fromStatus: previousStatus, queueId: conversation.channel, toOperatorId: null, toStatus: "queued" },
        eventType: "queue.entered",
        reason,
        sourceEventId: `${assignmentJob.id}:return_queue`
      });
    const assignmentRealtimeEvent = realtimeEvent("routing.assignment.updated", conversation.id, tenantId, {
      action: "return_queue",
      toStatus: conversation.status
    });
    if (canonicalConversation) {
      await this.persistManualTransition({
        action: "return_queue",
        canonicalConversation,
        conversation,
        events: [lifecycleEvent],
        jobs: [assignmentJob],
        operatorName: null,
        realtimeEvent: assignmentRealtimeEvent,
        tenantId
      });
    } else {
      await this.persistState({ events: [lifecycleEvent], jobs: [assignmentJob] });
    }

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
        realtimeEvent: assignmentRealtimeEvent
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

  private async listOperatorPresence(tenantId: string): Promise<Map<string, OperatorPresenceCurrentRecord>> {
    const records = await this.operatorPresence.listCurrent(tenantId);
    return new Map(records.map((record) => [record.operatorId, record]));
  }

  private async findOperatorPresence(tenantId: string, operatorId: string): Promise<OperatorPresenceCurrentRecord | undefined> {
    return await this.operatorPresence.findCurrent(tenantId, operatorId) ?? undefined;
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

  private async persistState(input: {
    analyticsRows?: RoutingAnalyticsRow[];
    events?: RoutingLifecycleEvent[];
    jobs?: RoutingJobDescriptor[];
  } = {}): Promise<void> {
    const current = this.routingRepository.readState();
    const state: RoutingState = {
      conversations: this.conversations,
      jobs: mergeRecords(await this.routingRepository.listJobs(), input.jobs ?? []),
      operatorCapacities: current.operatorCapacities,
      operators: this.operators,
      queueMemberships: current.queueMemberships,
      queues: this.queues,
      routingAnalyticsRows: mergeRecords(current.routingAnalyticsRows, input.analyticsRows ?? []),
      rescueReportRows: this.rescueReportRows,
      routingRules: current.routingRules
    };
    try {
      if ((input.events?.length ?? 0) > 0) {
        await this.routingRepository.saveStateWithLifecycleEvents(state, input.events!);
      } else {
        await this.routingRepository.saveState(state);
      }
    } catch (error) {
      this.conversations = clone(current.conversations);
      this.operators = clone(current.operators);
      this.queues = clone(current.queues);
      this.rescueReportRows = clone(current.rescueReportRows);
      throw error;
    }
  }

  private async hydrateCanonicalRoutingState(tenantId: string, conversationId?: string): Promise<CanonicalRoutingConversation | undefined> {
    if (!this.canonicalWorkload || !this.canonicalConversations) return undefined;
    const [workload, conversations] = await Promise.all([
      this.canonicalWorkload.readWorkload(tenantId),
      this.canonicalConversations.listConversations(tenantId)
    ]);
    this.operators = replaceTenantRecords(this.operators, workload.operators, tenantId);
    this.queues = replaceTenantRecords(this.queues, workload.queues, tenantId);
    this.conversations = replaceTenantRecords(this.conversations, conversations, tenantId);
    return conversationId ? conversations.find((conversation) => conversation.id === conversationId) : undefined;
  }

  private async persistManualTransition(input: {
    action: "assign" | "pause_sla" | "resolve_rescue" | "return_queue" | "start_rescue" | "transfer";
    analyticsRows?: RoutingAnalyticsRow[];
    canonicalConversation: CanonicalRoutingConversation;
    conversation: RoutingConversation;
    events: RoutingLifecycleEvent[];
    jobs: RoutingJobDescriptor[];
    operatorName?: string | null;
    queueId?: string;
    realtimeEvent: RealtimeEvent;
    teamId?: string | null;
    tenantId: string;
  }): Promise<void> {
    const current = this.routingRepository.readState();
    this.conversations = this.conversations.map((conversation) =>
      conversation.id === input.conversation.id && conversation.tenantId === input.tenantId
        ? clone(input.conversation)
        : conversation
    );
    const state: RoutingState = {
      ...current,
      conversations: this.conversations,
      jobs: mergeRecords(await this.routingRepository.listJobs(), input.jobs),
      operators: this.operators,
      queues: this.queues,
      routingAnalyticsRows: mergeRecords(current.routingAnalyticsRows, input.analyticsRows ?? []),
      rescueReportRows: this.rescueReportRows
    };
    try {
      const persisted = await this.routingRepository.saveManualRoutingTransition({
        action: input.action,
        conversationId: input.conversation.id,
        expectedOperatorId: input.canonicalConversation.operatorId ?? null,
        expectedStatus: input.canonicalConversation.persistedStatus,
        lifecycleEvents: input.events,
        ...(input.operatorName !== undefined ? { operatorName: input.operatorName } : {}),
        ...(input.queueId ? { queueId: input.queueId } : {}),
        realtimeEvent: input.realtimeEvent,
        state,
        ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
        tenantId: input.tenantId
      });
      this.conversations = clone(persisted.conversations);
      this.operators = clone(persisted.operators);
      this.queues = clone(persisted.queues);
      this.rescueReportRows = clone(persisted.rescueReportRows);
    } catch (error) {
      this.conversations = clone(current.conversations);
      this.operators = clone(current.operators);
      this.queues = clone(current.queues);
      this.rescueReportRows = clone(current.rescueReportRows);
      throw error;
    }
  }

  private async persistBatchTransition(input: {
    analyticsRows: RoutingAnalyticsRow[];
    batchTransitions: Array<{
      conversationId: string;
      expectedOperatorId: string | null;
      expectedStatus: string;
      operatorId: string;
      operatorName: string;
      slaTone: string;
      status: string;
      teamId?: string | null;
    }>;
    events: RoutingLifecycleEvent[];
    jobs: RoutingJobDescriptor[];
    realtimeEvents: RealtimeEvent[];
    tenantId: string;
  }): Promise<void> {
    const current = this.routingRepository.readState();
    const state: RoutingState = {
      ...current,
      conversations: this.conversations,
      jobs: mergeRecords(await this.routingRepository.listJobs(), input.jobs),
      operators: this.operators,
      queues: this.queues,
      routingAnalyticsRows: mergeRecords(current.routingAnalyticsRows, input.analyticsRows),
      rescueReportRows: this.rescueReportRows
    };
    try {
      const persisted = await this.routingRepository.saveBatchRoutingTransition({
        lifecycleEvents: input.events,
        realtimeEvents: input.realtimeEvents,
        state,
        tenantId: input.tenantId,
        transitions: input.batchTransitions
      });
      this.conversations = clone(persisted.conversations);
      this.operators = clone(persisted.operators);
      this.queues = clone(persisted.queues);
    } catch (error) {
      this.conversations = clone(current.conversations);
      this.operators = clone(current.operators);
      this.queues = clone(current.queues);
      throw error;
    }
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

function routingLifecycleEvent(input: {
  context: RoutingRequestContext;
  conversationId: string;
  data: Record<string, unknown>;
  eventType: string;
  reason?: string;
  sourceEventId: string;
}): RoutingLifecycleEvent {
  const occurredAt = new Date().toISOString();
  return {
    actorId: input.context.actorId ?? null,
    actorName: input.context.actorName ?? null,
    actorType: input.context.actorType ?? "system",
    conversationId: input.conversationId,
    data: input.data,
    eventType: input.eventType,
    id: `lifecycle_routing_${randomUUID()}`,
    ingestedAt: occurredAt,
    occurredAt,
    reason: input.reason?.trim() || null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "routing-api",
    sourceEventId: input.sourceEventId,
    tenantId: input.context.tenantId!,
    traceId: getCurrentTraceId() ?? createRequestTraceId(`routing:${input.eventType}`)
  };
}

function mergeRecords<T extends { id: string }>(current: T[], updates: T[]): T[] {
  const byId = new Map(current.map((record) => [record.id, record]));
  for (const update of updates) {
    byId.set(update.id, update);
  }
  return Array.from(byId.values());
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
    name: typeof (queue as RoutingQueue & { name?: string }).name === "string"
      ? (queue as RoutingQueue & { name: string }).name
      : queue.channel
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

function queueJob(kind: string, queue: string): RoutingJobDescriptor {
  return {
    id: makeId("job_routing"),
    kind,
    queue,
    status: "queued"
  };
}

function realtimeEvent(eventName: string, resourceId: string, tenantId: string, data: Record<string, unknown>): RealtimeEvent {
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

function hasUnknownCanonicalPresence(operator: RoutingOperator): boolean {
  return operator.availability?.source === "not_recorded";
}

/** Overlays the operator-selected presence status (FR §9.4) on top of the routing/canonical operator record. */
function withOperatorPresence(operator: RoutingOperator, presence?: OperatorPresenceCurrentRecord): RoutingOperator {
  if (!presence) {
    return operator;
  }

  return {
    ...operator,
    availability: { online: presence.status === "online", source: "operator_presence" },
    presenceSince: presence.since,
    presenceSource: "operator_presence",
    status: presence.status
  };
}

function operatorAcceptsAutoAssignment(operator: RoutingOperator): boolean {
  if (operator.presenceSource === "operator_presence") {
    return presenceAcceptsAutoAssignment(operator.status);
  }
  return operator.status === "online" || hasUnknownCanonicalPresence(operator);
}

function operatorAcceptsManualAssignment(operator: RoutingOperator): boolean {
  if (operator.presenceSource === "operator_presence") {
    return presenceAcceptsManualAssignment(operator.status);
  }
  return operator.status === "online" || hasUnknownCanonicalPresence(operator);
}

function presenceQualityLabel(operators: RoutingOperator[]): "not_recorded" | "operator_presence" | "partial" {
  const recorded = operators.filter((operator) => operator.presenceSource === "operator_presence").length;
  if (recorded === 0) {
    return "not_recorded";
  }
  return recorded === operators.length ? "operator_presence" : "partial";
}

function replaceTenantRecords<T extends { tenantId?: string }>(current: T[], canonical: T[], tenantId: string): T[] {
  return [...current.filter((record) => record.tenantId !== tenantId), ...canonical];
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
