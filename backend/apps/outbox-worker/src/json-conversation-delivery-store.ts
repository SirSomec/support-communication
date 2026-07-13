import { resolve } from "node:path";
import {
  JsonFileStore,
  type ConversationOutboundDescriptorStore,
  type WorkerConversationOutboundDescriptor
} from "@support-communication/database";
import {
  normalizeOutboxEvent,
  resolveRetryFailureState,
  type OutboxEvent,
  type OutboxEventClaimQuery,
  type OutboxEventListQuery,
  type OutboxEventStore,
  type OutboxRetryPolicy,
  type StoredOutboxEvent,
  type StoredOutboxEventStatus
} from "@support-communication/events";
import { redactSensitiveText } from "@support-communication/redaction";

interface ConversationDeliveryStoreState {
  outboundDescriptors?: Array<Record<string, unknown>>;
  outboxEvents?: Array<Record<string, unknown>>;
}

const EMPTY_STATE: ConversationDeliveryStoreState = {
  outboundDescriptors: [],
  outboxEvents: []
};

export function createJsonConversationOutboxStore(storeFilePath: string | undefined): OutboxEventStore {
  const store = openConversationDeliveryStore(storeFilePath);

  return {
    async append(event: OutboxEvent): Promise<StoredOutboxEvent> {
      const stored = normalizeOutboxEvent(event);
      store.update((state) => {
        const events = [...asObjectList(state.outboxEvents)];
        const index = events.findIndex((item) => stringValue(item.id) === stored.id);
        if (index >= 0) {
          events[index] = stored as unknown as Record<string, unknown>;
        } else {
          events.push(stored as unknown as Record<string, unknown>);
        }
        return { ...state, outboxEvents: events };
      });
      return clone(stored);
    },

    async claimPending({ leaseTimeoutMs = 300_000, limit = 100, now = new Date(), queue }: OutboxEventClaimQuery = {}): Promise<StoredOutboxEvent[]> {
      const claimed: StoredOutboxEvent[] = [];
      const staleBefore = new Date(now.getTime() - leaseTimeoutMs);

      store.update((state) => {
        const events = asObjectList(state.outboxEvents)
          .map((item) => toStoredOutboxEvent(item))
          .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

        for (let index = 0; index < events.length && claimed.length < limit; index += 1) {
          const event = events[index]!;
          if (queue && event.queue !== queue) {
            continue;
          }

          const stalePublishing = event.status === "publishing"
            && event.lockedAt
            && Date.parse(event.lockedAt) <= staleBefore.getTime();
          const retryableFailure = event.status === "failed"
            && (!event.nextAttemptAt || Date.parse(event.nextAttemptAt) <= now.getTime());
          if (event.status !== "pending" && !retryableFailure && !stalePublishing) {
            continue;
          }

          const updated: StoredOutboxEvent = {
            ...event,
            lockedAt: now.toISOString(),
            status: "publishing"
          };
          events[index] = updated;
          claimed.push(updated);
        }

        return {
          ...state,
          outboxEvents: events as unknown as Array<Record<string, unknown>>
        };
      });

      return clone(claimed);
    },

    async list({ limit, queue, statuses }: OutboxEventListQuery = {}): Promise<StoredOutboxEvent[]> {
      const matching = asObjectList(store.read().outboxEvents)
        .map((item) => toStoredOutboxEvent(item))
        .filter((event) => !queue || event.queue === queue)
        .filter((event) => !statuses || statuses.includes(event.status))
        .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

      return clone(limit ? matching.slice(0, limit) : matching);
    },

    async markFailed(id: string, error: Error | string, failedAt = new Date(), policy: OutboxRetryPolicy = {}): Promise<StoredOutboxEvent> {
      let updated!: StoredOutboxEvent;
      store.update((state) => {
        const events = asObjectList(state.outboxEvents).map((item) => toStoredOutboxEvent(item));
        const index = events.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new Error(`Outbox event ${id} was not found.`);
        }

        const event = events[index]!;
        const failure = resolveRetryFailureState(policy.currentAttempts ?? event.attempts, failedAt, policy);
        updated = {
          ...event,
          attempts: failure.attempts,
          deadLetteredAt: failure.deadLetteredAt,
          lastError: formatFailureError(error),
          lockedAt: null,
          nextAttemptAt: failure.nextAttemptAt,
          publishedAt: null,
          status: failure.status
        };
        events[index] = updated;
        return {
          ...state,
          outboxEvents: events as unknown as Array<Record<string, unknown>>
        };
      });

      return clone(updated);
    },

    async markPublished(id: string, publishedAt = new Date()): Promise<StoredOutboxEvent> {
      let updated!: StoredOutboxEvent;
      store.update((state) => {
        const events = asObjectList(state.outboxEvents).map((item) => toStoredOutboxEvent(item));
        const index = events.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new Error(`Outbox event ${id} was not found.`);
        }

        const event = events[index]!;
        updated = {
          ...event,
          deadLetteredAt: null,
          lastError: null,
          lockedAt: null,
          nextAttemptAt: null,
          publishedAt: publishedAt.toISOString(),
          status: "published"
        };
        events[index] = updated;
        return {
          ...state,
          outboxEvents: events as unknown as Array<Record<string, unknown>>
        };
      });

      return clone(updated);
    },

    async replayDeadLettered(id: string, queue: string, reason: string, replayedAt = new Date(), auditEvent?: Record<string, unknown>): Promise<StoredOutboxEvent> {
      let updated!: StoredOutboxEvent;
      store.update((state) => {
        const events = asObjectList(state.outboxEvents).map((item) => toStoredOutboxEvent(item));
        const index = events.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
        }

        const event = events[index]!;
        if (event.queue !== queue || event.status !== "dead_lettered") {
          throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
        }

        updated = {
          ...event,
          attempts: event.attempts + 1,
          deadLetteredAt: null,
          deadLetterReplayAuditEvents: auditEvent
            ? [...(event.deadLetterReplayAuditEvents ?? []), auditEvent]
            : event.deadLetterReplayAuditEvents ?? [],
          lastError: redactSensitiveText(`dead_letter_replay:${reason}`),
          lockedAt: null,
          nextAttemptAt: null,
          publishedAt: null,
          status: "failed"
        };
        events[index] = updated;
        return {
          ...state,
          outboxEvents: events as unknown as Array<Record<string, unknown>>
        };
      });

      return clone(updated);
    }
  };
}

export function createJsonConversationOutboundDescriptorStore(storeFilePath: string | undefined): ConversationOutboundDescriptorStore {
  const store = openConversationDeliveryStore(storeFilePath);

  return {
    async findOutboundDescriptorById(descriptorId: string): Promise<WorkerConversationOutboundDescriptor | null> {
      const row = asObjectList(store.read().outboundDescriptors)
        .find((item) => stringValue(item.id) === descriptorId);
      return row ? toWorkerOutboundDescriptor(row) : null;
    },

    async markOutboundDescriptorDelivery(descriptorId, deliveryState) {
      let updated: WorkerConversationOutboundDescriptor | null = null;
      store.update((state) => {
        const descriptors = asObjectList(state.outboundDescriptors);
        const index = descriptors.findIndex((item) => stringValue(item.id) === descriptorId);
        if (index < 0) {
          return state;
        }

        const next = {
          ...descriptors[index]!,
          deliveryState,
          retryable: deliveryState !== "delivered",
          status: deliveryState,
          updatedAt: new Date().toISOString()
        };
        descriptors[index] = next;
        updated = toWorkerOutboundDescriptor(next);
        return { ...state, outboundDescriptors: descriptors };
      });
      return updated;
    }
  };
}

function openConversationDeliveryStore(storeFilePath: string | undefined): JsonFileStore<ConversationDeliveryStoreState> {
  const filePath = String(storeFilePath ?? "").trim();
  if (!filePath) {
    throw new Error("conversation_store_file_required");
  }

  return new JsonFileStore<ConversationDeliveryStoreState>({
    filePath: resolve(filePath),
    seed: EMPTY_STATE
  });
}

function toStoredOutboxEvent(row: Record<string, unknown>): StoredOutboxEvent {
  const status = stringValue(row.status) as StoredOutboxEventStatus | undefined;
  const base = normalizeOutboxEvent({
    aggregateId: requireString(row.aggregateId, "aggregate_id_required"),
    aggregateType: requireString(row.aggregateType, "aggregate_type_required"),
    id: requireString(row.id, "outbox_id_required"),
    occurredAt: requireString(row.occurredAt, "occurred_at_required"),
    payload: objectValue(row.payload) ?? {},
    queue: requireString(row.queue, "queue_required"),
    status: "pending",
    traceId: requireString(row.traceId, "trace_id_required"),
    type: requireString(row.type, "type_required")
  });

  return {
    ...base,
    attempts: numberValue(row.attempts) ?? 0,
    deadLetteredAt: stringValue(row.deadLetteredAt),
    deadLetterReplayAuditEvents: Array.isArray(row.deadLetterReplayAuditEvents)
      ? row.deadLetterReplayAuditEvents.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
      : [],
    lastError: stringValue(row.lastError),
    lockedAt: stringValue(row.lockedAt),
    nextAttemptAt: stringValue(row.nextAttemptAt),
    publishedAt: stringValue(row.publishedAt),
    status: status && isStoredOutboxStatus(status) ? status : "pending"
  };
}

function toWorkerOutboundDescriptor(row: Record<string, unknown>): WorkerConversationOutboundDescriptor {
  return {
    channel: requireString(row.channel, "channel_required"),
    conversationId: stringValue(row.conversationId),
    id: requireString(row.id, "descriptor_id_required"),
    idempotencyKey: stringValue(row.idempotencyKey),
    kind: requireString(row.kind, "kind_required") as WorkerConversationOutboundDescriptor["kind"],
    messageId: stringValue(row.messageId),
    payload: objectValue(row.payload) ?? {},
    tenantId: requireString(row.tenantId, "tenant_id_required")
  };
}

function isStoredOutboxStatus(value: string): value is StoredOutboxEventStatus {
  return value === "dead_lettered"
    || value === "failed"
    || value === "pending"
    || value === "published"
    || value === "publishing";
}

function asObjectList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function requireString(value: unknown, code: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new Error(code);
  }
  return normalized;
}

function formatFailureError(error: Error | string): string {
  return redactSensitiveText(typeof error === "string" ? error : error.message);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
