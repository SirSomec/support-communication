import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { createDisabledRealtimeFanoutAdapter, createRealtimeFanoutAdapterFromEnv, type RealtimeFanoutAdapter } from "../conversation/realtime.fanout.js";
import { IdentityRepository, type IdentityRepositoryPort } from "../identity/identity.repository.js";
import type { IdentityTenantUser } from "../identity/identity.types.js";
import { OperatorPresenceRepository, type OperatorPresenceRepositoryPort } from "./operator-presence.repository.js";
import {
  isOperatorPresenceStatus,
  OPERATOR_PRESENCE_STATUSES,
  presenceAcceptsAutoAssignment,
  type OperatorPresenceCurrentRecord,
  type OperatorPresenceStatus
} from "./operator-presence.types.js";

const PRESENCE_SERVICE = "operatorPresenceService";
const REALTIME_SCHEMA_VERSION = "v1";
export const OPERATOR_PRESENCE_UPDATED_EVENT = "operator.presence.updated";

export interface PresenceRequestContext {
  actorId?: string;
  actorName?: string;
  actorType?: "operator" | "service_admin";
  tenantId?: string;
}

export interface PresenceServiceOptions {
  /**
   * Drains queued dialogs after an operator becomes available. Routing remains
   * responsible for candidate selection and capacity checks.
   */
  autoAssignQueuedConversations?: (tenantId: string) => Promise<void>;
  conversationRepository?: Pick<ConversationRepository, "appendRealtimeEvent">;
  identityRepository?: Pick<IdentityRepositoryPort, "findTenantUsers">;
  presenceRepository?: OperatorPresenceRepositoryPort;
  realtimeFanout?: RealtimeFanoutAdapter;
}

let defaultRealtimeFanout: RealtimeFanoutAdapter = createDisabledRealtimeFanoutAdapter("presence_realtime_fanout_not_configured");

export class OperatorPresenceService {
  private readonly autoAssignQueuedConversations?: (tenantId: string) => Promise<void>;
  private readonly conversationRepository: Pick<ConversationRepository, "appendRealtimeEvent">;
  private readonly identityRepository: Pick<IdentityRepositoryPort, "findTenantUsers">;
  private readonly presenceRepository: OperatorPresenceRepositoryPort;
  private readonly realtimeFanout: RealtimeFanoutAdapter;

  constructor(options: PresenceServiceOptions = {}) {
    this.autoAssignQueuedConversations = options.autoAssignQueuedConversations;
    this.conversationRepository = options.conversationRepository ?? ConversationRepository.default();
    this.identityRepository = options.identityRepository ?? IdentityRepository.default();
    this.presenceRepository = options.presenceRepository ?? OperatorPresenceRepository.default();
    this.realtimeFanout = options.realtimeFanout ?? defaultRealtimeFanout;
  }

  static configureRealtimeFanoutFromEnv(source: NodeJS.ProcessEnv = process.env): void {
    defaultRealtimeFanout = createRealtimeFanoutAdapterFromEnv(source);
  }

  async fetchMyPresence(context: PresenceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const scope = requireOperatorScope("fetchMyPresence", context);
    if ("error" in scope) return scope.error;

    const presence = await this.presenceRepository.findCurrent(scope.tenantId, scope.operatorId);

    return createEnvelope({
      service: PRESENCE_SERVICE,
      operation: "fetchMyPresence",
      traceId: presenceTraceId("fetchMyPresence"),
      meta: { operatorId: scope.operatorId },
      data: {
        presence: presence ? presenceView(presence) : null,
        statuses: OPERATOR_PRESENCE_STATUSES
      }
    });
  }

  async setMyPresence(
    payload: { status?: string },
    context: PresenceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const scope = requireOperatorScope("setMyPresence", context);
    if ("error" in scope) return scope.error;

    const status = String(payload.status ?? "").trim();
    if (!isOperatorPresenceStatus(status)) {
      return errorEnvelope("setMyPresence", "invalid", "presence_status_unsupported", `Presence status ${status || "(empty)"} is not supported.`, {
        status: status || null,
        supportedStatuses: OPERATOR_PRESENCE_STATUSES.map((descriptor) => descriptor.key)
      });
    }

    const result = await this.presenceRepository.setStatus({
      changedBy: scope.operatorId,
      operatorId: scope.operatorId,
      status,
      tenantId: scope.tenantId
    });

    let realtimeEvent: RealtimeEvent | null = null;
    let autoAssignmentTriggered = false;
    if (result.changed) {
      const operatorName = await this.resolveOperatorName(scope.tenantId, scope.operatorId);
      realtimeEvent = await this.publishPresenceUpdate({
        operatorId: scope.operatorId,
        operatorName,
        previousStatus: result.previous?.status ?? null,
        since: result.current.since,
        status: result.current.status,
        tenantId: scope.tenantId
      });

      // A dialog may have reached a queue while every operator was offline.
      // Presence changes are the next reliable signal that it can be assigned;
      // without this retry, such dialogs remain queued until the client sends
      // another message.
      if (presenceAcceptsAutoAssignment(result.current.status)
        && !presenceAcceptsAutoAssignment(result.previous?.status ?? "offline")) {
        autoAssignmentTriggered = true;
        try {
          await this.autoAssignQueuedConversations?.(scope.tenantId);
        } catch {
          // Presence must remain saved even if queue draining is temporarily unavailable.
        }
      }
    }

    return createEnvelope({
      service: PRESENCE_SERVICE,
      operation: "setMyPresence",
      traceId: presenceTraceId("setMyPresence"),
      meta: { changed: result.changed, operatorId: scope.operatorId },
      data: {
        changed: result.changed,
        autoAssignmentTriggered,
        presence: presenceView(result.current),
        previousStatus: result.previous?.status ?? null,
        realtimeEvent,
        statuses: OPERATOR_PRESENCE_STATUSES
      }
    });
  }

  /**
   * Used when an operator leaves the workplace. This is deliberately a
   * compare-and-set: a stale browser tab must not overwrite a status the
   * operator selected later in another tab or device.
   */
  async markMyPresenceUnavailableIfOnline(context: PresenceRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const scope = requireOperatorScope("markMyPresenceUnavailableIfOnline", context);
    if ("error" in scope) return scope.error;

    const result = await this.presenceRepository.setStatusIfCurrent({
      changedBy: scope.operatorId,
      expectedStatus: "online",
      operatorId: scope.operatorId,
      status: "unavailable",
      tenantId: scope.tenantId
    });

    let realtimeEvent: RealtimeEvent | null = null;
    if (result.changed && result.current) {
      realtimeEvent = await this.publishPresenceUpdate({
        operatorId: scope.operatorId,
        operatorName: await this.resolveOperatorName(scope.tenantId, scope.operatorId),
        previousStatus: result.previous?.status ?? null,
        since: result.current.since,
        status: result.current.status,
        tenantId: scope.tenantId
      });
    }

    return createEnvelope({
      service: PRESENCE_SERVICE,
      operation: "markMyPresenceUnavailableIfOnline",
      traceId: presenceTraceId("markMyPresenceUnavailableIfOnline"),
      meta: { changed: result.changed, operatorId: scope.operatorId },
      data: {
        changed: result.changed,
        presence: result.current ? presenceView(result.current) : null,
        previousStatus: result.previous?.status ?? null,
        realtimeEvent,
        skipped: !result.conditionMatched
      }
    });
  }

  async fetchTeamPresence(
    filters: { from?: string; to?: string } = {},
    context: PresenceRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = String(context.tenantId ?? "").trim();
    if (!tenantId) {
      return errorEnvelope("fetchTeamPresence", "invalid", "tenant_context_required", "Tenant context is required for team presence reads.", {});
    }

    const range = resolvePresenceRange(filters);
    if ("error" in range) {
      return errorEnvelope("fetchTeamPresence", "invalid", "presence_range_invalid", range.error, { from: filters.from ?? null, to: filters.to ?? null });
    }

    const [users, currentRecords, intervals] = await Promise.all([
      this.identityRepository.findTenantUsers(tenantId),
      this.presenceRepository.listCurrent(tenantId),
      this.presenceRepository.listIntervalsInRange(tenantId, range.value)
    ]);
    const activeUsers = users.filter((user) => user.tenantId === tenantId && user.status === "active");
    const currentByOperator = new Map(currentRecords.map((record) => [record.operatorId, record]));
    const secondsByOperator = summarizeIntervalSeconds(intervals, range.value);

    const operators = activeUsers.map((user) => {
      const current = currentByOperator.get(user.id) ?? null;
      const seconds = secondsByOperator.get(user.id) ?? {};
      return {
        name: user.name,
        operatorId: user.id,
        role: user.role,
        seconds,
        since: current?.since ?? null,
        status: current?.status ?? null,
        trackedSeconds: Object.values(seconds).reduce((sum, value) => sum + value, 0)
      };
    }).sort((left, right) => left.name.localeCompare(right.name));

    return createEnvelope({
      service: PRESENCE_SERVICE,
      operation: "fetchTeamPresence",
      traceId: presenceTraceId("fetchTeamPresence"),
      meta: { operatorCount: operators.length, tenantId },
      data: {
        operators,
        range: {
          from: range.value.from.toISOString(),
          to: range.value.to.toISOString()
        },
        refreshedAt: new Date().toISOString(),
        statuses: OPERATOR_PRESENCE_STATUSES
      }
    });
  }

  private async resolveOperatorName(tenantId: string, operatorId: string): Promise<string> {
    try {
      const users = await this.identityRepository.findTenantUsers(tenantId);
      return users.find((user: IdentityTenantUser) => user.id === operatorId)?.name ?? operatorId;
    } catch {
      return operatorId;
    }
  }

  private async publishPresenceUpdate(input: {
    operatorId: string;
    operatorName: string;
    previousStatus: OperatorPresenceStatus | null;
    since: string;
    status: OperatorPresenceStatus;
    tenantId: string;
  }): Promise<RealtimeEvent> {
    const event: RealtimeEvent = {
      data: {
        operatorId: input.operatorId,
        operatorName: input.operatorName,
        previousStatus: input.previousStatus,
        since: input.since,
        status: input.status
      },
      eventId: `rt_presence_${randomUUID()}`,
      eventName: OPERATOR_PRESENCE_UPDATED_EVENT,
      occurredAt: new Date().toISOString(),
      resourceId: input.operatorId,
      resourceType: "operator",
      schemaVersion: REALTIME_SCHEMA_VERSION,
      tenantId: input.tenantId,
      traceId: presenceTraceId(OPERATOR_PRESENCE_UPDATED_EVENT)
    };

    try {
      await this.conversationRepository.appendRealtimeEvent(event);
      await this.realtimeFanout.publish(event);
    } catch {
      // Persisted replay remains available when live fan-out is degraded.
    }

    return event;
  }
}

function presenceView(record: OperatorPresenceCurrentRecord): Record<string, unknown> {
  return {
    changedBy: record.changedBy,
    operatorId: record.operatorId,
    since: record.since,
    status: record.status
  };
}

function requireOperatorScope(
  operation: string,
  context: PresenceRequestContext
): { operatorId: string; tenantId: string } | { error: BackendEnvelope<Record<string, unknown>> } {
  const tenantId = String(context.tenantId ?? "").trim();
  const operatorId = String(context.actorId ?? "").trim();
  if (!tenantId) {
    return { error: errorEnvelope(operation, "invalid", "tenant_context_required", "Tenant context is required for presence access.", {}) };
  }
  if (!operatorId || context.actorType !== "operator") {
    return { error: errorEnvelope(operation, "denied", "operator_context_required", "Own presence is available to tenant operators only.", {
      actorType: context.actorType ?? null
    }) };
  }
  return { operatorId, tenantId };
}

function resolvePresenceRange(filters: { from?: string; to?: string }): { value: { from: Date; to: Date } } | { error: string } {
  const now = new Date();
  const to = filters.to ? new Date(filters.to) : now;
  const from = filters.from ? new Date(filters.from) : startOfUtcDay(now);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: "Range boundaries must be valid ISO timestamps." };
  }
  if (from.getTime() >= to.getTime()) {
    return { error: "Range start must be earlier than range end." };
  }
  return { value: { from, to } };
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function summarizeIntervalSeconds(
  intervals: Array<{ endedAt: string | null; operatorId: string; startedAt: string; status: OperatorPresenceStatus }>,
  range: { from: Date; to: Date }
): Map<string, Partial<Record<OperatorPresenceStatus, number>>> {
  const summary = new Map<string, Partial<Record<OperatorPresenceStatus, number>>>();
  for (const interval of intervals) {
    const startMs = Math.max(new Date(interval.startedAt).getTime(), range.from.getTime());
    const endMs = Math.min(interval.endedAt ? new Date(interval.endedAt).getTime() : range.to.getTime(), range.to.getTime());
    const seconds = Math.floor((endMs - startMs) / 1000);
    if (seconds <= 0) continue;
    const operatorSummary = summary.get(interval.operatorId) ?? {};
    operatorSummary[interval.status] = (operatorSummary[interval.status] ?? 0) + seconds;
    summary.set(interval.operatorId, operatorSummary);
  }
  return summary;
}

function errorEnvelope(
  operation: string,
  status: "denied" | "invalid",
  code: string,
  message: string,
  details: Record<string, unknown>
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: PRESENCE_SERVICE,
    operation,
    status,
    traceId: presenceTraceId(operation),
    error: { code, message, details },
    data: {}
  });
}

function presenceTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(PRESENCE_SERVICE, operation);
}
