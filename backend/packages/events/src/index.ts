import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";

export interface OutboxEventInput {
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, unknown>;
  queue?: string;
  traceId: string;
  type: string;
}

export interface OutboxEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  queue: string;
  status: "pending";
  traceId: string;
  type: string;
}

export type StoredOutboxEventStatus = "dead_lettered" | "failed" | "pending" | "published" | "publishing";

export interface StoredOutboxEvent extends Omit<OutboxEvent, "status"> {
  attempts: number;
  deadLetteredAt: string | null;
  deadLetterReplayAuditEvents?: Array<Record<string, unknown>>;
  lastError: string | null;
  lockedAt: string | null;
  nextAttemptAt: string | null;
  publishedAt: string | null;
  status: StoredOutboxEventStatus;
}

export interface OutboxEventListQuery {
  limit?: number;
  queue?: string;
  statuses?: StoredOutboxEventStatus[];
}

export interface OutboxEventClaimQuery {
  leaseTimeoutMs?: number;
  limit?: number;
  now?: Date;
  queue?: string;
}

export interface OutboxEventStore {
  append(event: OutboxEvent): Promise<StoredOutboxEvent>;
  claimPending(query?: OutboxEventClaimQuery): Promise<StoredOutboxEvent[]>;
  list(query?: OutboxEventListQuery): Promise<StoredOutboxEvent[]>;
  markFailed(id: string, error: Error | string, failedAt?: Date, policy?: OutboxRetryPolicy): Promise<StoredOutboxEvent>;
  markPublished(id: string, publishedAt?: Date): Promise<StoredOutboxEvent>;
  replayDeadLettered(id: string, queue: string, reason: string, replayedAt?: Date, auditEvent?: Record<string, unknown>): Promise<StoredOutboxEvent>;
}

export interface OutboxPublishResult {
  failed: number;
  published: number;
  scanned: number;
}

export type OutboxDispatcher = (event: StoredOutboxEvent) => Promise<void>;

type MaybePromise<T> = T | Promise<T>;

export interface OutboxWorkerOptions {
  intervalMs?: number;
  leaseTimeoutMs?: number;
  limit?: number;
  maxAttempts?: number;
  queue?: string;
  retryBackoffMs?: number;
  sleep?: (milliseconds: number) => MaybePromise<void>;
}

export interface OutboxWorkerStartOptions {
  maxIterations?: number;
}

export interface OutboxWorkerRunResult extends OutboxPublishResult {
  iterations: number;
  stopped: boolean;
}

export interface OutboxRetryPolicy {
  currentAttempts?: number;
  maxAttempts?: number;
  retryBackoffMs?: number;
}

export interface RetryFailureState {
  attempts: number;
  deadLetteredAt: string | null;
  nextAttemptAt: string | null;
  status: "dead_lettered" | "failed";
}

export function createOutboxEvent({
  aggregateId,
  aggregateType,
  payload,
  queue = "domain-events",
  traceId,
  type
}: OutboxEventInput): OutboxEvent {
  return {
    id: `outbox_${randomUUID()}`,
    aggregateId,
    aggregateType,
    occurredAt: new Date().toISOString(),
    payload,
    queue,
    status: "pending",
    traceId,
    type
  };
}

export class InMemoryOutboxStore implements OutboxEventStore {
  private readonly events = new Map<string, StoredOutboxEvent>();

  async append(event: OutboxEvent): Promise<StoredOutboxEvent> {
    const stored = normalizeOutboxEvent(event);
    this.events.set(stored.id, stored);
    return clone(stored);
  }

  async list({ limit, queue, statuses }: OutboxEventListQuery = {}): Promise<StoredOutboxEvent[]> {
    const matching = [...this.events.values()]
      .filter((event) => !queue || event.queue === queue)
      .filter((event) => !statuses || statuses.includes(event.status))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

    return clone(limit ? matching.slice(0, limit) : matching);
  }

  async claimPending({ leaseTimeoutMs = 300_000, limit = 100, now = new Date(), queue }: OutboxEventClaimQuery = {}): Promise<StoredOutboxEvent[]> {
    const staleBefore = new Date(now.getTime() - leaseTimeoutMs);
    const claimed: StoredOutboxEvent[] = [];

    for (const event of [...this.events.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))) {
      if (claimed.length >= limit) {
        break;
      }

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
      this.events.set(event.id, updated);
      claimed.push(updated);
    }

    return clone(claimed);
  }

  async markFailed(id: string, error: Error | string, failedAt = new Date(), policy: OutboxRetryPolicy = {}): Promise<StoredOutboxEvent> {
    const event = this.requireEvent(id);
    const failure = resolveRetryFailureState(event.attempts, failedAt, policy);
    const updated: StoredOutboxEvent = {
      ...event,
      attempts: failure.attempts,
      deadLetteredAt: failure.deadLetteredAt,
      lastError: formatFailureError(error),
      lockedAt: null,
      nextAttemptAt: failure.nextAttemptAt,
      publishedAt: null,
      status: failure.status
    };

    this.events.set(id, updated);
    return clone(updated);
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<StoredOutboxEvent> {
    const event = this.requireEvent(id);
    const updated: StoredOutboxEvent = {
      ...event,
      deadLetteredAt: null,
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      publishedAt: publishedAt.toISOString(),
      status: "published"
    };

    this.events.set(id, updated);
    return clone(updated);
  }

  async replayDeadLettered(id: string, queue: string, reason: string, replayedAt = new Date(), auditEvent?: Record<string, unknown>): Promise<StoredOutboxEvent> {
    const event = this.requireEvent(id);
    if (event.queue !== queue || event.status !== "dead_lettered") {
      throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
    }

    const updated: StoredOutboxEvent = {
      ...event,
      attempts: event.attempts + 1,
      deadLetteredAt: null,
      deadLetterReplayAuditEvents: appendAuditEvent(event.deadLetterReplayAuditEvents, auditEvent),
      lastError: redactSensitiveText(`dead_letter_replay:${reason}`),
      lockedAt: null,
      nextAttemptAt: null,
      publishedAt: null,
      status: "failed"
    };

    this.events.set(id, updated);
    return clone(updated);
  }

  private requireEvent(id: string): StoredOutboxEvent {
    const event = this.events.get(id);
    if (!event) {
      throw new Error(`Outbox event ${id} was not found.`);
    }

    return event;
  }
}

export class OutboxPublisher {
  constructor(
    private readonly store: OutboxEventStore,
    private readonly dispatch: OutboxDispatcher
  ) {}

  async publishPending({ leaseTimeoutMs = 300_000, limit = 100, maxAttempts, queue, retryBackoffMs }: { leaseTimeoutMs?: number; limit?: number; maxAttempts?: number; queue?: string; retryBackoffMs?: number } = {}): Promise<OutboxPublishResult> {
    const pending = await this.store.claimPending({
      leaseTimeoutMs,
      limit,
      queue
    });
    let failed = 0;
    let published = 0;

    for (const event of pending) {
      try {
        await this.dispatch(event);
        await this.store.markPublished(event.id);
        published += 1;
      } catch (error) {
        await this.store.markFailed(event.id, error instanceof Error ? error : String(error), new Date(), {
          currentAttempts: event.attempts,
          maxAttempts,
          retryBackoffMs
        });
        failed += 1;
      }
    }

    return {
      failed,
      published,
      scanned: pending.length
    };
  }
}

export class OutboxWorker {
  private runPromise: Promise<OutboxWorkerRunResult> | null = null;
  private stopping = false;

  constructor(
    private readonly publisher: OutboxPublisher,
    private readonly options: OutboxWorkerOptions = {}
  ) {}

  stop(): void {
    this.stopping = true;
  }

  runOnce(overrides: OutboxWorkerOptions = {}): Promise<OutboxPublishResult> {
    const options = { ...this.options, ...overrides };

    return this.publisher.publishPending({
      leaseTimeoutMs: options.leaseTimeoutMs,
      limit: options.limit,
      maxAttempts: options.maxAttempts,
      queue: options.queue,
      retryBackoffMs: options.retryBackoffMs
    });
  }

  async start({ maxIterations }: OutboxWorkerStartOptions = {}): Promise<OutboxWorkerRunResult> {
    if (this.runPromise) {
      return this.runPromise;
    }

    this.stopping = false;
    this.runPromise = this.runLoop(maxIterations).finally(() => {
      this.runPromise = null;
    });

    return this.runPromise;
  }

  private async runLoop(maxIterations: number | undefined): Promise<OutboxWorkerRunResult> {
    const result: OutboxWorkerRunResult = {
      failed: 0,
      iterations: 0,
      published: 0,
      scanned: 0,
      stopped: false
    };
    while (!this.stopping && (maxIterations === undefined || result.iterations < maxIterations)) {
      const iteration = await this.runOnce();
      result.failed += iteration.failed;
      result.published += iteration.published;
      result.scanned += iteration.scanned;
      result.iterations += 1;

      if (this.stopping || result.iterations >= (maxIterations ?? Number.POSITIVE_INFINITY)) {
        break;
      }

      await this.sleep(this.options.intervalMs ?? 1_000);
    }

    result.stopped = this.stopping;
    return result;
  }

  private sleep(milliseconds: number): Promise<void> {
    const sleep = this.options.sleep ?? defaultSleep;
    return Promise.resolve(sleep(milliseconds));
  }
}

export function normalizeOutboxEvent(event: OutboxEvent): StoredOutboxEvent {
  return {
    ...event,
    attempts: 0,
    deadLetteredAt: null,
    deadLetterReplayAuditEvents: [],
    lastError: null,
    lockedAt: null,
    nextAttemptAt: null,
    publishedAt: null
  };
}

function formatFailureError(error: Error | string): string {
  return redactSensitiveText(typeof error === "string" ? error : error.message);
}

export function resolveRetryFailureState(currentAttempts: number, failedAt: Date, policy: OutboxRetryPolicy = {}): RetryFailureState {
  const attempts = Math.max(0, currentAttempts) + 1;
  const maxAttempts = positiveInteger(policy.maxAttempts);
  const retryBackoffMs = positiveInteger(policy.retryBackoffMs);
  const exhausted = maxAttempts !== undefined && attempts >= maxAttempts;

  return {
    attempts,
    deadLetteredAt: exhausted ? failedAt.toISOString() : null,
    nextAttemptAt: !exhausted && retryBackoffMs !== undefined
      ? new Date(failedAt.getTime() + retryBackoffMs).toISOString()
      : null,
    status: exhausted ? "dead_lettered" : "failed"
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function appendAuditEvent(events: Array<Record<string, unknown>> | undefined, event: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  return event ? [...events ?? [], event] : events ?? [];
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
