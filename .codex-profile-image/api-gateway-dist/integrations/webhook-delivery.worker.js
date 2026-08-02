import { createHmac } from "node:crypto";
export function recordWebhookDeliveryAttemptSuccess(input) {
    const current = input.repository.findWebhookDeliveryJournalEntry(input.deliveryId);
    if (!current) {
        throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
    }
    if (current.status !== "publishing" || !current.lockedAt) {
        throw new Error(`webhook_delivery_not_claimed:${input.deliveryId}`);
    }
    const updated = input.repository.recordWebhookDeliveryAttemptSuccess({
        attemptedAt: input.attemptedAt,
        deliveryId: input.deliveryId
    });
    if (!updated) {
        throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
    }
    return updated;
}
export function recordWebhookDeliveryFailureForRetry(input) {
    const current = input.repository.findWebhookDeliveryJournalEntry(input.deliveryId);
    if (!current) {
        throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
    }
    if (current.status !== "publishing" || !current.lockedAt) {
        throw new Error(`webhook_delivery_not_claimed:${input.deliveryId}`);
    }
    const failure = resolveWebhookDeliveryFailureState({
        currentAttempts: current.attempts,
        failedAt: input.failedAt,
        maxAttempts: input.maxAttempts,
        retryBackoffMs: input.retryBackoffMs
    });
    if (failure.status !== "retry_scheduled" || !failure.nextAttemptAt) {
        throw new Error(`webhook_delivery_retry_schedule_not_available:${input.deliveryId}`);
    }
    const updated = input.repository.recordWebhookDeliveryRetryState({
        attempts: failure.attempts,
        deliveryId: input.deliveryId,
        lastAttemptAt: input.failedAt,
        lastError: input.error,
        nextAttemptAt: failure.nextAttemptAt
    });
    if (!updated) {
        throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
    }
    return updated;
}
export async function runWebhookDeliveryWorkerOnce(input) {
    const now = input.now ?? new Date().toISOString();
    const claimed = await input.repository.claimWebhookDeliveryJournalEntriesAsync({
        leaseTimeoutMs: input.leaseTimeoutMs,
        limit: input.limit ?? 50,
        now,
        queue: input.queue ?? "webhook-delivery"
    });
    const result = {
        claimed: claimed.length,
        deadLettered: 0,
        delivered: 0,
        failed: 0,
        retryScheduled: 0
    };
    for (const entry of claimed) {
        try {
            const providerResponse = await input.provider.deliver(entry);
            const delivered = await input.repository.recordWebhookDeliveryAttemptSuccessAsync({
                attemptedAt: now,
                deliveryId: entry.deliveryId
            });
            if (delivered) {
                result.delivered += 1;
            }
            else {
                result.failed += 1;
            }
            void providerResponse;
        }
        catch (error) {
            const failure = resolveWebhookDeliveryFailureState({
                currentAttempts: entry.attempts,
                failedAt: now,
                maxAttempts: input.maxAttempts ?? 3,
                retryBackoffMs: input.retryBackoffMs ?? 60_000
            });
            const workerError = webhookDeliveryProviderError(error);
            if (failure.status === "dead_lettered") {
                const deadLettered = await input.repository.recordWebhookDeliveryDeadLetterStateAsync({
                    attempts: failure.attempts,
                    deadLetteredAt: failure.deadLetteredAt ?? now,
                    deliveryId: entry.deliveryId,
                    lastAttemptAt: now,
                    lastError: workerError
                });
                if (deadLettered) {
                    result.deadLettered += 1;
                }
                else {
                    result.failed += 1;
                }
                continue;
            }
            const scheduled = await input.repository.recordWebhookDeliveryRetryStateAsync({
                attempts: failure.attempts,
                deliveryId: entry.deliveryId,
                lastAttemptAt: now,
                lastError: workerError,
                nextAttemptAt: failure.nextAttemptAt ?? new Date(Date.parse(now) + (input.retryBackoffMs ?? 60_000)).toISOString()
            });
            if (scheduled) {
                result.retryScheduled += 1;
            }
            else {
                result.failed += 1;
            }
        }
    }
    return result;
}
export function createDeterministicWebhookDeliveryProvider() {
    return {
        async deliver(entry) {
            return {
                body: `local-webhook-delivery:${entry.deliveryId}`,
                statusCode: 202
            };
        }
    };
}
export function createDisabledWebhookDeliveryProvider(reason = "webhook_delivery_provider_not_configured") {
    return {
        async deliver() {
            throw Object.assign(new Error(reason), {
                code: reason,
                statusCode: 503
            });
        }
    };
}
export function createHttpWebhookDeliveryProvider(options = {}) {
    const fetchImpl = options.fetchImpl ?? fetch;
    const timeoutMs = positiveInteger(options.timeoutMs);
    return {
        async deliver(entry) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs ?? 10_000);
            const body = JSON.stringify({
                deliveryId: entry.deliveryId,
                endpointId: entry.endpointId,
                eventType: entry.eventType,
                idempotencyKey: entry.idempotencyKey,
                payloadRef: entry.payloadRef,
                tenantId: entry.tenantId,
                traceId: entry.traceId
            });
            const timestamp = new Date().toISOString();
            try {
                const response = await fetchImpl(entry.targetUrl, {
                    body,
                    headers: {
                        "content-type": "application/json",
                        "idempotency-key": entry.idempotencyKey,
                        "x-webhook-delivery-id": entry.deliveryId,
                        "x-webhook-trace-id": entry.traceId,
                        ...(options.signingSecret ? {
                            "x-webhook-signature": `sha256=${createHmac("sha256", options.signingSecret).update(`${timestamp}.${body}`).digest("hex")}`,
                            "x-webhook-timestamp": timestamp
                        } : {})
                    },
                    method: "POST",
                    signal: controller.signal
                });
                const responseBody = await response.text();
                if (!response.ok) {
                    throw Object.assign(new Error(`Webhook provider responded ${response.status}: ${responseBody.slice(0, 300)}`), {
                        code: "provider_http_error",
                        statusCode: response.status
                    });
                }
                return {
                    body: responseBody,
                    statusCode: response.status
                };
            }
            finally {
                clearTimeout(timeout);
            }
        }
    };
}
export function resolveWebhookDeliveryFailureState(input) {
    const failedAtMs = Date.parse(input.failedAt);
    if (!Number.isFinite(failedAtMs)) {
        throw new Error("webhook_delivery_failed_at_invalid");
    }
    const failedAt = new Date(failedAtMs);
    const attempts = Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1;
    const maxAttempts = positiveInteger(input.maxAttempts);
    const retryBackoffMs = positiveInteger(input.retryBackoffMs);
    const exhausted = maxAttempts !== undefined && attempts >= maxAttempts;
    let nextAttemptAt = null;
    if (!exhausted) {
        if (retryBackoffMs === undefined) {
            throw new Error("webhook_delivery_retry_backoff_invalid");
        }
        nextAttemptAt = new Date(failedAt.getTime() + retryBackoffMs).toISOString();
    }
    return {
        attempts,
        deadLetteredAt: exhausted ? failedAt.toISOString() : null,
        nextAttemptAt,
        status: exhausted ? "dead_lettered" : "retry_scheduled"
    };
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
function webhookDeliveryProviderError(error) {
    const carrier = error;
    return {
        code: typeof carrier?.code === "string" && carrier.code.trim() ? carrier.code : "provider_delivery_failed",
        message: typeof carrier?.message === "string" && carrier.message.trim() ? carrier.message : String(error),
        ...(typeof carrier?.statusCode === "number" ? { statusCode: carrier.statusCode } : {})
    };
}
//# sourceMappingURL=webhook-delivery.worker.js.map