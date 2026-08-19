import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import {
  createDisabledRealtimeFanoutAdapter,
  createRealtimeFanoutAdapterFromEnv,
  type RealtimeFanoutAdapter
} from "../conversation/realtime.fanout.js";
import { IdentityRepository, type IdentityRepositoryPort } from "../identity/identity.repository.js";
import {
  CurrentShiftRepository,
  type CurrentShiftRecord,
  type CurrentShiftRepositoryPort
} from "./current-shift.repository.js";

const CURRENT_SHIFT_SERVICE = "currentShiftService";
const REALTIME_SCHEMA_VERSION = "v1";
const MAX_SHIFT_NAME_LENGTH = 120;
const MAX_SHIFT_OPERATORS = 500;

export const SHIFT_UPDATED_EVENT = "shift.updated";

export interface ShiftRequestContext {
  actorId?: string;
  actorName?: string;
  actorType?: "operator" | "service_admin";
  tenantId?: string;
}

export interface CurrentShiftPayload {
  endsAt?: unknown;
  name?: unknown;
  operatorIds?: unknown;
  startsAt?: unknown;
}

export interface CurrentShiftServiceOptions {
  conversationRepository?: Pick<ConversationRepository, "appendRealtimeEvent">;
  currentShiftRepository?: CurrentShiftRepositoryPort;
  identityRepository?: Pick<IdentityRepositoryPort, "findTenantUsers">;
  realtimeFanout?: RealtimeFanoutAdapter;
}

let defaultRealtimeFanout: RealtimeFanoutAdapter = createDisabledRealtimeFanoutAdapter("shift_realtime_fanout_not_configured");

export class CurrentShiftService {
  private readonly conversationRepository: Pick<ConversationRepository, "appendRealtimeEvent">;
  private readonly currentShiftRepository: CurrentShiftRepositoryPort;
  private readonly identityRepository: Pick<IdentityRepositoryPort, "findTenantUsers">;
  private readonly realtimeFanout: RealtimeFanoutAdapter;

  constructor(options: CurrentShiftServiceOptions = {}) {
    this.conversationRepository = options.conversationRepository ?? ConversationRepository.default();
    this.currentShiftRepository = options.currentShiftRepository ?? CurrentShiftRepository.default();
    this.identityRepository = options.identityRepository ?? IdentityRepository.default();
    this.realtimeFanout = options.realtimeFanout ?? defaultRealtimeFanout;
  }

  static configureRealtimeFanoutFromEnv(source: NodeJS.ProcessEnv = process.env): void {
    defaultRealtimeFanout = createRealtimeFanoutAdapterFromEnv(source);
  }

  async fetchCurrentShift(context: ShiftRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId("fetchCurrentShift", context);
    if (typeof tenantId !== "string") return tenantId;

    const shift = await this.currentShiftRepository.findCurrent(tenantId);
    return createEnvelope({
      service: CURRENT_SHIFT_SERVICE,
      operation: "fetchCurrentShift",
      traceId: shiftTraceId("fetchCurrentShift"),
      meta: { tenantId },
      data: {
        refreshedAt: new Date().toISOString(),
        shift: shift ? currentShiftView(shift) : null
      }
    });
  }

  async saveCurrentShift(
    payload: CurrentShiftPayload | null | undefined,
    context: ShiftRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = requireTenantId("saveCurrentShift", context);
    if (typeof tenantId !== "string") return tenantId;

    const normalized = normalizePayload(payload);
    if ("error" in normalized) {
      return errorEnvelope("saveCurrentShift", normalized.error.code, normalized.error.message, normalized.error.details);
    }

    const users = await this.identityRepository.findTenantUsers(tenantId);
    const activeOperatorIds = new Set(
      users
        .filter((user) => user.tenantId === tenantId && String(user.status).toLowerCase() === "active")
        .map((user) => user.id)
    );
    const inactiveOrUnknownOperatorIds = normalized.value.operatorIds.filter((operatorId) => !activeOperatorIds.has(operatorId));
    if (inactiveOrUnknownOperatorIds.length) {
      return errorEnvelope(
        "saveCurrentShift",
        "shift_operators_not_active",
        "Every shift operator must be an active user of the current tenant.",
        { operatorIds: inactiveOrUnknownOperatorIds }
      );
    }

    const shift = await this.currentShiftRepository.saveCurrent({
      ...normalized.value,
      tenantId
    });
    const realtimeEvent = await this.publishShiftUpdate(shift, context);

    return createEnvelope({
      service: CURRENT_SHIFT_SERVICE,
      operation: "saveCurrentShift",
      traceId: shiftTraceId("saveCurrentShift"),
      meta: { tenantId },
      data: {
        realtimeEvent,
        shift: currentShiftView(shift)
      }
    });
  }

  private async publishShiftUpdate(shift: CurrentShiftRecord, context: ShiftRequestContext): Promise<RealtimeEvent> {
    const event: RealtimeEvent = {
      data: {
        ...(context.actorId ? { updatedBy: { id: context.actorId, name: context.actorName ?? null, type: context.actorType ?? null } } : {}),
        shift: currentShiftView(shift)
      },
      eventId: `rt_shift_${randomUUID()}`,
      eventName: SHIFT_UPDATED_EVENT,
      occurredAt: new Date().toISOString(),
      resourceId: shift.tenantId,
      resourceType: "shift",
      schemaVersion: REALTIME_SCHEMA_VERSION,
      tenantId: shift.tenantId,
      traceId: shiftTraceId(SHIFT_UPDATED_EVENT)
    };

    try {
      await this.conversationRepository.appendRealtimeEvent(event);
      await this.realtimeFanout.publish(event);
    } catch {
      // Saving a shift remains durable even when event replay or Redis fan-out is degraded.
    }

    return event;
  }
}

function normalizePayload(
  payload: CurrentShiftPayload | null | undefined
): { value: { endsAt: Date; name: string; operatorIds: string[]; startsAt: Date } } | {
  error: { code: string; details: Record<string, unknown>; message: string };
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return invalidPayload("shift_payload_required", "Current shift payload is required.", {});
  }

  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name) {
    return invalidPayload("shift_name_required", "Shift name is required.", {});
  }
  if (name.length > MAX_SHIFT_NAME_LENGTH) {
    return invalidPayload("shift_name_too_long", `Shift name must be at most ${MAX_SHIFT_NAME_LENGTH} characters.`, {
      maxLength: MAX_SHIFT_NAME_LENGTH
    });
  }

  const startsAt = parseIsoTimestamp(payload.startsAt, "startsAt");
  if ("error" in startsAt) return startsAt;
  const endsAt = parseIsoTimestamp(payload.endsAt, "endsAt");
  if ("error" in endsAt) return endsAt;
  if (endsAt.value.getTime() <= startsAt.value.getTime()) {
    return invalidPayload("shift_time_range_invalid", "Shift endsAt must be later than startsAt.", {
      endsAt: payload.endsAt ?? null,
      startsAt: payload.startsAt ?? null
    });
  }

  if (!Array.isArray(payload.operatorIds)) {
    return invalidPayload("shift_operator_ids_required", "operatorIds must be an array.", {});
  }
  if (payload.operatorIds.length > MAX_SHIFT_OPERATORS) {
    return invalidPayload("shift_operator_ids_too_many", `A shift can include at most ${MAX_SHIFT_OPERATORS} operators.`, {
      maxLength: MAX_SHIFT_OPERATORS
    });
  }

  const operatorIds: string[] = [];
  for (const rawOperatorId of payload.operatorIds) {
    if (typeof rawOperatorId !== "string" || !rawOperatorId.trim()) {
      return invalidPayload("shift_operator_id_invalid", "Every operatorId must be a non-empty string.", {
        operatorId: rawOperatorId ?? null
      });
    }
    operatorIds.push(rawOperatorId.trim());
  }
  if (new Set(operatorIds).size !== operatorIds.length) {
    return invalidPayload("shift_operator_ids_duplicate", "operatorIds must not contain duplicates.", {});
  }

  return {
    value: {
      endsAt: endsAt.value,
      name,
      operatorIds,
      startsAt: startsAt.value
    }
  };
}

function parseIsoTimestamp(value: unknown, field: "endsAt" | "startsAt"):
  | { value: Date }
  | { error: { code: string; details: Record<string, unknown>; message: string } } {
  if (typeof value !== "string" || !isStrictIsoTimestamp(value)) {
    return invalidPayload("shift_timestamp_invalid", `${field} must be a valid ISO-8601 timestamp with a timezone.`, {
      field,
      value: value ?? null
    });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return invalidPayload("shift_timestamp_invalid", `${field} must be a valid ISO-8601 timestamp with a timezone.`, {
      field,
      value
    });
  }
  return { value: date };
}

function isStrictIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second = "0", , timezone, offsetHour = "0", offsetMinute = "0"] = match;
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);
  if (numericMonth < 1 || numericMonth > 12
    || numericDay < 1 || numericDay > new Date(Date.UTC(numericYear, numericMonth, 0)).getUTCDate()
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    return false;
  }
  return timezone === "Z" || (Number(offsetHour) <= 23 && Number(offsetMinute) <= 59);
}

function requireTenantId(
  operation: string,
  context: ShiftRequestContext
): string | BackendEnvelope<Record<string, unknown>> {
  const tenantId = String(context.tenantId ?? "").trim();
  if (tenantId) return tenantId;
  return errorEnvelope(operation, "tenant_context_required", "Tenant context is required for current shift access.", {});
}

function currentShiftView(shift: CurrentShiftRecord): Record<string, unknown> {
  return {
    endsAt: shift.endsAt,
    name: shift.name,
    operatorIds: [...shift.operatorIds],
    startsAt: shift.startsAt,
    updatedAt: shift.updatedAt
  };
}

function invalidPayload(
  code: string,
  message: string,
  details: Record<string, unknown>
): { error: { code: string; details: Record<string, unknown>; message: string } } {
  return { error: { code, details, message } };
}

function errorEnvelope(
  operation: string,
  code: string,
  message: string,
  details: Record<string, unknown>
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: CURRENT_SHIFT_SERVICE,
    operation,
    status: "invalid",
    traceId: shiftTraceId(operation),
    error: { code, details, message },
    data: {}
  });
}

function shiftTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(CURRENT_SHIFT_SERVICE, operation);
}
