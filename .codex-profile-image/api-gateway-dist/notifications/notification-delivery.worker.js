import { createHash } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
const DEFAULT_RETRY_DELAY_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_MS = 5 * 60_000;
export function createNotificationDeliveryProviderPort(adapter) {
    if (typeof adapter.send !== "function") {
        throw new Error("notification_delivery_provider_send_required");
    }
    return {
        send(request) {
            return adapter.send(request);
        }
    };
}
export function createDeterministicNotificationDeliveryProviderAdapter(options = {}) {
    const deliveries = [];
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
export function createDisabledNotificationDeliveryProviderAdapter(reason = "notification_delivery_provider_not_configured") {
    return {
        async send() {
            throw new Error(reason);
        }
    };
}
export function createWebPushNotificationDeliveryProviderAdapter(client) {
    return {
        async send(request) {
            const response = await client.sendNotification({
                endpoint: request.endpoint,
                keys: {
                    auth: request.keys.auth,
                    p256dh: request.keys.p256dh
                }
            }, JSON.stringify(request.payload), {
                TTL: 60,
                urgency: "high"
            });
            return {
                providerMessageId: providerMessageIdFromResponse(response, request.descriptorId)
            };
        }
    };
}
export async function executeNotificationDeliveryWorker(input) {
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
    const result = {
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
        }
        catch (error) {
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
            }
            else {
                result.failed += 1;
            }
        }
    }
    return result;
}
function toBrowserPushDeliveryRequest(descriptor, subscription) {
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
function sanitizeProviderError(error, subscription) {
    const raw = error instanceof Error ? error.message : String(error);
    return [
        subscription.endpoint,
        subscription.keys.auth,
        subscription.keys.p256dh
    ].reduce((message, secret) => message.split(secret).join("[REDACTED:push_subscription]"), redactSensitiveText(raw)).slice(0, 600);
}
function providerMessageIdFromResponse(response, descriptorId) {
    const location = response?.headers?.location;
    if (typeof location === "string" && location) {
        return location;
    }
    if (Array.isArray(location) && location[0]) {
        return location[0];
    }
    return `web_push_${descriptorId}`;
}
function normalizePositiveInteger(value, fallback, code) {
    const normalized = value ?? fallback;
    if (!Number.isInteger(normalized) || normalized <= 0) {
        throw new Error(code);
    }
    return normalized;
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=notification-delivery.worker.js.map