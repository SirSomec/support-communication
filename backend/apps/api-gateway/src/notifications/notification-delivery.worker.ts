import { createHash } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import {
  NotificationRepository,
  type BrowserPushSubscriptionRecord,
  type NotificationDeliveryDescriptor
} from "./notification.repository.js";

export interface BrowserPushDeliveryRequest {
  descriptorId: string;
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
  payload: {
    body: string;
    title: string;
    url: string;
  };
  subscriptionId: string;
  tenantId: string;
  traceId: string;
}

export interface BrowserPushDeliveryResult {
  deliveredAt?: string;
  providerMessageId: string;
}

export interface WebPushProviderClient {
  sendNotification(
    subscription: {
      endpoint: string;
      keys: {
        auth: string;
        p256dh: string;
      };
    },
    payload: string,
    options: {
      TTL: number;
      urgency: "high" | "low" | "normal" | "very-low";
    }
  ): Promise<{
    headers?: Record<string, string | string[] | undefined>;
    statusCode?: number;
  } | void>;
}

export interface NotificationDeliveryProviderPort {
  send(request: BrowserPushDeliveryRequest): Promise<BrowserPushDeliveryResult>;
}

export type NotificationDeliveryProviderAdapter = Partial<NotificationDeliveryProviderPort>;

export interface DeterministicNotificationDeliveryProviderAdapter extends NotificationDeliveryProviderPort {
  listDeliveries(): BrowserPushDeliveryRequest[];
}

export interface DeterministicNotificationDeliveryProviderOptions {
  now?: () => Date;
}

export interface NotificationDeliveryWorkerInput {
  leaseMs?: number;
  limit?: number;
  maxAttempts?: number;
  notificationRepository: NotificationRepository;
  now?: Date;
  provider: NotificationDeliveryProviderPort;
  queue?: string;
  retryDelayMs?: number;
  tenantId?: string;
}

export interface NotificationDeliveryWorkerResult {
  delivered: number;
  failed: number;
  retried: number;
  scanned: number;
}

const DEFAULT_RETRY_DELAY_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 5 * 60_000;

export function createNotificationDeliveryProviderPort(
  adapter: NotificationDeliveryProviderAdapter
): NotificationDeliveryProviderPort {
  if (typeof adapter.send !== "function") {
    throw new Error("notification_delivery_provider_send_required");
  }

  return {
    send(request) {
      return adapter.send!(request);
    }
  };
}

export function createDeterministicNotificationDeliveryProviderAdapter(
  options: DeterministicNotificationDeliveryProviderOptions = {}
): DeterministicNotificationDeliveryProviderAdapter {
  const deliveries: BrowserPushDeliveryRequest[] = [];
  const now = options.now ?? (() => new Date("2026-07-03T10:00:00.000Z"));

  return {
    listDeliveries() {
      return clone(deliveries);
    },

    async send(request) {
      deliveries.push(clone(request));
      return {
        deliveredAt: now().toISOString(),
        providerMessageId: `deterministic_push_${createHash("sha256").update(request.descriptorId).digest("hex").slice(0, 16)}`
      };
    }
  };
}

export function createDisabledNotificationDeliveryProviderAdapter(reason = "notification_delivery_provider_not_configured"): NotificationDeliveryProviderPort {
  return {
    async send() {
      throw new Error(reason);
    }
  };
}

export function createWebPushNotificationDeliveryProviderAdapter(
  client: WebPushProviderClient
): NotificationDeliveryProviderPort {
  return {
    async send(request) {
      const response = await client.sendNotification(
        {
          endpoint: request.endpoint,
          keys: {
            auth: request.keys.auth,
            p256dh: request.keys.p256dh
          }
        },
        JSON.stringify(request.payload),
        {
          TTL: 60,
          urgency: "high"
        }
      );

      return {
        providerMessageId: providerMessageIdFromResponse(response, request.descriptorId)
      };
    }
  };
}

export async function executeNotificationDeliveryWorker(
  input: NotificationDeliveryWorkerInput
): Promise<NotificationDeliveryWorkerResult> {
  const now = input.now ?? new Date();
  const leaseMs = normalizePositiveInteger(input.leaseMs, DEFAULT_LEASE_MS, "notification_delivery_lease_invalid");
  const limit = normalizePositiveInteger(input.limit, 50, "notification_delivery_limit_invalid");
  const maxAttempts = normalizePositiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS, "notification_delivery_max_attempts_invalid");
  const queue = input.queue?.trim() || "browser-push";
  const retryDelayMs = normalizePositiveInteger(input.retryDelayMs, DEFAULT_RETRY_DELAY_MS, "notification_delivery_retry_delay_invalid");
  const descriptors = await input.notificationRepository.claimNotificationDeliveryDescriptorsAsync({
    leaseMs,
    limit,
    now: now.toISOString(),
    queue,
    tenantId: input.tenantId
  });
  const result: NotificationDeliveryWorkerResult = {
    delivered: 0,
    failed: 0,
    retried: 0,
    scanned: descriptors.length
  };

  for (const descriptor of descriptors) {
    const subscription = await input.notificationRepository.findBrowserPushSubscriptionAsync({
      subscriptionId: descriptor.subscriptionId,
      tenantId: descriptor.tenantId,
      userId: descriptor.userId
    });

    if (subscription?.status !== "active") {
      await input.notificationRepository.markNotificationDeliveryDescriptorFailedAsync({
        descriptorId: descriptor.id,
        expectedClaimedAt: descriptor.updatedAt,
        failedAt: now.toISOString(),
        lastError: "browser_push_subscription_unavailable",
        retriable: false
      });
      result.failed += 1;
      continue;
    }

    try {
      const delivered = await input.provider.send(toBrowserPushDeliveryRequest(descriptor, subscription));
      await input.notificationRepository.markNotificationDeliveryDescriptorDeliveredAsync({
        deliveredAt: delivered.deliveredAt ?? now.toISOString(),
        descriptorId: descriptor.id,
        expectedClaimedAt: descriptor.updatedAt,
        providerMessageId: delivered.providerMessageId
      });
      result.delivered += 1;
    } catch (error) {
      const attemptsAfterFailure = (descriptor.attempts ?? 0) + 1;
      const retriable = attemptsAfterFailure < maxAttempts;
      await input.notificationRepository.markNotificationDeliveryDescriptorFailedAsync({
        descriptorId: descriptor.id,
        expectedClaimedAt: descriptor.updatedAt,
        failedAt: now.toISOString(),
        lastError: sanitizeProviderError(error, subscription),
        nextAttemptAt: retriable ? new Date(now.getTime() + retryDelayMs).toISOString() : null,
        retriable
      });

      if (retriable) {
        result.retried += 1;
      } else {
        result.failed += 1;
      }
    }
  }

  return result;
}

function toBrowserPushDeliveryRequest(
  descriptor: NotificationDeliveryDescriptor,
  subscription: BrowserPushSubscriptionRecord
): BrowserPushDeliveryRequest {
  return {
    descriptorId: descriptor.id,
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.keys.auth,
      p256dh: subscription.keys.p256dh
    },
    payload: {
      body: descriptor.payload.body,
      title: descriptor.payload.title,
      url: descriptor.payload.url
    },
    subscriptionId: subscription.id,
    tenantId: descriptor.tenantId,
    traceId: descriptor.traceId
  };
}

function sanitizeProviderError(error: unknown, subscription: BrowserPushSubscriptionRecord): string {
  const raw = error instanceof Error ? error.message : String(error);
  return [
    subscription.endpoint,
    subscription.keys.auth,
    subscription.keys.p256dh
  ].reduce(
    (message, secret) => message.split(secret).join("[REDACTED:push_subscription]"),
    redactSensitiveText(raw)
  ).slice(0, 600);
}

function providerMessageIdFromResponse(
  response: Awaited<ReturnType<WebPushProviderClient["sendNotification"]>>,
  descriptorId: string
): string {
  const location = response?.headers?.location;
  if (typeof location === "string" && location) {
    return location;
  }
  if (Array.isArray(location) && location[0]) {
    return location[0];
  }

  return `web_push_${descriptorId}`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number, code: string): number {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(code);
  }

  return normalized;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
