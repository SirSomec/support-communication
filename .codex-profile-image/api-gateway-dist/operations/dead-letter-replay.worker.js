import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
const QUEUE_OWNERSHIP = {
    "billing-sync": {
        ownerQueue: "billing-sync",
        replayEnabled: false,
        resourceType: "billing_sync"
    },
    "realtime-fanout": {
        ownerQueue: "realtime-fanout",
        replayEnabled: false,
        resourceType: "realtime_fanout"
    },
    "report-export": {
        ownerQueue: "report-export",
        replayEnabled: true,
        resourceType: "report_export"
    },
    "webhook-delivery": {
        ownerQueue: "webhook-delivery",
        replayEnabled: true,
        resourceType: "webhook_delivery"
    }
};
export function listKnownDeadLetterQueueNames() {
    return Object.keys(QUEUE_OWNERSHIP).sort();
}
export function resolveDeadLetterQueueOwnership(queueName) {
    return QUEUE_OWNERSHIP[queueName] ? { ...QUEUE_OWNERSHIP[queueName] } : undefined;
}
export function validateDeadLetterQueueOwnership(message) {
    const ownership = resolveDeadLetterQueueOwnership(message.queueName);
    if (!ownership) {
        return {
            code: "dead_letter_queue_unknown",
            message: `Dead-letter queue ${message.queueName} is not registered for replay.`,
            ok: false,
            ownership: null
        };
    }
    if (ownership.resourceType !== message.resourceType) {
        return {
            code: "dead_letter_queue_ownership_mismatch",
            message: `Dead-letter queue ${message.queueName} does not own resource type ${message.resourceType}.`,
            ok: false,
            ownership
        };
    }
    if (!ownership.replayEnabled) {
        return {
            code: "dead_letter_replay_disabled",
            message: `Dead-letter replay is disabled for queue ${message.queueName}.`,
            ok: false,
            ownership
        };
    }
    return {
        code: null,
        message: null,
        ok: true,
        ownership
    };
}
export function buildDeadLetterReplayIdempotencyFingerprint(input) {
    return JSON.stringify({
        messageId: input.messageId,
        reason: normalizeReason(input.reason),
        resourceId: input.resourceId
    });
}
export function validateDeadLetterReplayIdempotency(input) {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
        return { ok: true };
    }
    const cached = input.operationsRepository.findDeadLetterReplayIdempotencyKey(idempotencyKey);
    if (!cached) {
        return { ok: true };
    }
    if (cached.fingerprint !== input.fingerprint) {
        return {
            code: "idempotency_key_reused",
            ok: false
        };
    }
    return {
        cachedResult: cached.result,
        duplicate: true,
        ok: true
    };
}
export async function validateDeadLetterReplayIdempotencyAsync(input) {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
        return { ok: true };
    }
    const cached = await input.operationsRepository.findDeadLetterReplayIdempotencyKeyAsync(idempotencyKey);
    if (!cached) {
        return { ok: true };
    }
    if (cached.fingerprint !== input.fingerprint) {
        return {
            code: "idempotency_key_reused",
            ok: false
        };
    }
    return {
        cachedResult: cached.result,
        duplicate: true,
        ok: true
    };
}
export async function requeueDeadLetterThroughReplayHelper(input) {
    const normalizedId = requireNonEmpty(input.id, "dead_letter_item_id_required");
    const normalizedQueue = requireNonEmpty(input.queue, "dead_letter_queue_required");
    const normalizedReason = requireNonEmpty(input.reason, "dead_letter_replay_reason_required");
    const now = input.now ?? new Date();
    const auditEvent = {
        action: "worker.dead_letter.replay",
        at: now.toISOString(),
        id: `evt_dead_letter_replay_${normalizedId}_${now.getTime()}`,
        immutable: true,
        queue: normalizedQueue,
        reason: normalizedReason,
        result: "requeued",
        target: normalizedId
    };
    const item = await input.backendStore.replayDeadLettered(normalizedId, normalizedQueue, normalizedReason, now, auditEvent);
    return { auditEvent, item };
}
export async function executeDeadLetterReplayWorker(input) {
    const ownership = validateDeadLetterQueueOwnership(input.message);
    if (!ownership.ok) {
        return denyDeadLetterReplayAsync({
            code: ownership.code ?? "dead_letter_queue_unknown",
            message: ownership.message ?? "Dead-letter replay was denied.",
            messageId: input.message.id,
            operationsRepository: input.operationsRepository,
            queueName: input.message.queueName,
            reason: input.reason
        });
    }
    const fingerprint = buildDeadLetterReplayIdempotencyFingerprint({
        messageId: input.message.id,
        reason: input.reason,
        resourceId: input.message.resourceId
    });
    const asyncIdempotency = await validateDeadLetterReplayIdempotencyAsync({
        fingerprint,
        idempotencyKey: input.idempotencyKey,
        operationsRepository: input.operationsRepository
    });
    if (!asyncIdempotency.ok) {
        return denyDeadLetterReplayAsync({
            code: asyncIdempotency.code ?? "idempotency_key_reused",
            message: "Idempotency key was already used for a different dead-letter replay request.",
            messageId: input.message.id,
            operationsRepository: input.operationsRepository,
            queueName: input.message.queueName,
            reason: input.reason
        });
    }
    if (asyncIdempotency.duplicate && asyncIdempotency.cachedResult) {
        return {
            audit: requeueAuditFromCached(asyncIdempotency.cachedResult, input.message, input.reason),
            backendItem: backendItemFromCached(asyncIdempotency.cachedResult),
            duplicate: true,
            replay: replayFromCached(asyncIdempotency.cachedResult),
            status: "requeued"
        };
    }
    let requeued;
    try {
        requeued = await requeueDeadLetterThroughReplayHelper({
            backendStore: input.backendStore,
            id: input.message.resourceId,
            now: input.now,
            queue: ownership.ownership.ownerQueue,
            reason: input.reason
        });
    }
    catch (error) {
        return denyDeadLetterReplayAsync({
            code: deadLetterReplayBackendFailureCode(error),
            message: deadLetterReplayBackendFailureMessage(error, input.message.queueName),
            messageId: input.message.id,
            operationsRepository: input.operationsRepository,
            queueName: input.message.queueName,
            reason: input.reason
        });
    }
    const replay = {
        id: makeReplayQueueId(),
        messageId: input.message.id,
        originalTraceId: input.message.originalTraceId,
        queue: "dead-letter-replay",
        sourceQueue: input.message.queueName
    };
    const persistedReplay = await input.operationsRepository.saveDeadLetterReplayAsync({
        auditEvent: {
            action: "operations.dead_letter.replay",
            id: `evt_operations_dead_letter_${randomUUID()}`,
            immutable: true,
            reason: normalizeReason(input.reason),
            target: input.message.id
        },
        reason: normalizeReason(input.reason),
        replay
    });
    const requeueAudit = await input.operationsRepository.saveDeadLetterReplayRequeueAuditAsync({
        auditEvent: {
            action: "operations.dead_letter.replay.requeued",
            backendAuditId: requeued.auditEvent.id,
            id: `evt_dead_letter_requeue_${randomUUID()}`,
            immutable: true,
            messageId: input.message.id,
            queueName: input.message.queueName,
            reason: normalizeReason(input.reason),
            resourceId: input.message.resourceId,
            target: input.message.id
        },
        messageId: input.message.id,
        queueName: input.message.queueName,
        reason: normalizeReason(input.reason),
        replay: persistedReplay.replay
    });
    if (input.idempotencyKey?.trim()) {
        await input.operationsRepository.saveDeadLetterReplayIdempotencyKeyAsync({
            fingerprint,
            key: input.idempotencyKey.trim(),
            result: {
                audit: requeueAudit.auditEvent,
                backendItem: requeued.item,
                replay: persistedReplay.replay
            }
        });
    }
    return {
        audit: {
            action: "operations.dead_letter.replay.requeued",
            backendAuditId: requeued.auditEvent.id,
            id: String(requeueAudit.auditEvent.id),
            immutable: true,
            messageId: input.message.id,
            queueName: input.message.queueName,
            reason: normalizeReason(input.reason) ?? "",
            resourceId: input.message.resourceId,
            target: input.message.id
        },
        backendItem: requeued.item,
        replay: persistedReplay.replay,
        status: "requeued"
    };
}
export function persistDeadLetterReplayValidationDenial(operationsRepository, record) {
    return operationsRepository.saveDeadLetterReplayValidationDenial(record);
}
export function persistDeadLetterReplayRequeueAudit(operationsRepository, record) {
    return operationsRepository.saveDeadLetterReplayRequeueAudit(record);
}
export function createDeadLetterReplayConflictEnvelope(input) {
    return {
        code: input.code,
        message: redactSensitiveText(input.message),
        messageId: input.messageId,
        queueName: input.queueName,
        sanitized: true
    };
}
export function createDeterministicDeadLetterReplayBackendStore(options = {}) {
    const items = options.items ?? new Map();
    const missingIds = options.missingIds ?? new Set();
    const queueMismatches = options.queueMismatches ?? new Set();
    return {
        async replayDeadLettered(id, queue, reason, replayedAt = new Date(), auditEvent) {
            if (missingIds.has(id)) {
                throw new Error(`dead_letter_item_not_found:${queue}`);
            }
            if (queueMismatches.has(id)) {
                throw new Error(`dead_letter_item_not_found:${queue}`);
            }
            const existing = items.get(`${queue}:${id}`) ?? {
                attempts: 3,
                deadLetteredAt: "2026-06-27T07:21:00.000Z",
                id,
                lastError: "provider failure",
                queue,
                status: "dead_lettered"
            };
            const replayed = {
                ...existing,
                attempts: existing.attempts + 1,
                deadLetteredAt: null,
                lastError: `dead_letter_replay:${reason}`,
                status: "failed"
            };
            items.set(`${queue}:${id}`, replayed);
            if (!auditEvent) {
                throw new Error("dead_letter_replay_audit_required");
            }
            return replayed;
        }
    };
}
export function createUnavailableDeadLetterReplayBackendStore() {
    return {
        async replayDeadLettered(_id, queue) {
            throw new Error(`dead_letter_replay_backend_unavailable:${queue}`);
        }
    };
}
function denyDeadLetterReplay(input) {
    const audit = {
        action: "operations.dead_letter.replay.validation_denied",
        code: input.code,
        id: `evt_dead_letter_validation_denied_${randomUUID()}`,
        immutable: true,
        messageId: input.messageId,
        queueName: input.queueName,
        reason: normalizeReason(input.reason) ?? "",
        target: input.messageId
    };
    const validationDenial = persistDeadLetterReplayValidationDenial(input.operationsRepository, {
        auditEvent: { ...audit },
        code: input.code,
        messageId: input.messageId,
        queueName: input.queueName,
        reason: normalizeReason(input.reason)
    });
    return {
        audit,
        envelope: createDeadLetterReplayConflictEnvelope({
            code: input.code,
            message: input.message,
            messageId: input.messageId,
            queueName: input.queueName
        }),
        status: "denied",
        validationDenial
    };
}
async function denyDeadLetterReplayAsync(input) {
    const audit = {
        action: "operations.dead_letter.replay.validation_denied",
        code: input.code,
        id: `evt_dead_letter_validation_denied_${randomUUID()}`,
        immutable: true,
        messageId: input.messageId,
        queueName: input.queueName,
        reason: normalizeReason(input.reason) ?? "",
        target: input.messageId
    };
    const validationDenial = await input.operationsRepository.saveDeadLetterReplayValidationDenialAsync({
        auditEvent: { ...audit },
        code: input.code,
        messageId: input.messageId,
        queueName: input.queueName,
        reason: normalizeReason(input.reason)
    });
    return {
        audit,
        envelope: createDeadLetterReplayConflictEnvelope({
            code: input.code,
            message: input.message,
            messageId: input.messageId,
            queueName: input.queueName
        }),
        status: "denied",
        validationDenial
    };
}
function backendItemFromCached(cached) {
    const item = cached.backendItem;
    if (!item || typeof item !== "object") {
        throw new Error("dead_letter_replay_cached_backend_item_missing");
    }
    return item;
}
function replayFromCached(cached) {
    const replay = cached.replay;
    if (!replay || typeof replay !== "object") {
        throw new Error("dead_letter_replay_cached_replay_missing");
    }
    return replay;
}
function requeueAuditFromCached(cached, message, reason) {
    const audit = cached.audit;
    if (!audit || typeof audit !== "object") {
        return {
            action: "operations.dead_letter.replay.requeued",
            backendAuditId: "cached",
            id: `evt_dead_letter_requeue_cached_${message.id}`,
            immutable: true,
            messageId: message.id,
            queueName: message.queueName,
            reason: normalizeReason(reason) ?? "",
            resourceId: message.resourceId,
            target: message.id
        };
    }
    const record = audit;
    return {
        action: "operations.dead_letter.replay.requeued",
        backendAuditId: String(record.backendAuditId ?? "cached"),
        id: String(record.id ?? `evt_dead_letter_requeue_cached_${message.id}`),
        immutable: true,
        messageId: message.id,
        queueName: message.queueName,
        reason: normalizeReason(reason) ?? "",
        resourceId: message.resourceId,
        target: message.id
    };
}
function makeReplayQueueId() {
    return `dead_letter_replay_${randomUUID()}`;
}
function deadLetterReplayBackendFailureCode(error) {
    return error instanceof Error && error.message.includes("dead_letter_replay_backend_unavailable")
        ? "dead_letter_replay_backend_unavailable"
        : "dead_letter_replay_backend_failed";
}
function deadLetterReplayBackendFailureMessage(error, queueName) {
    if (error instanceof Error && error.message.includes("dead_letter_replay_backend_unavailable")) {
        return `Dead-letter replay backend is not configured for queue ${queueName}.`;
    }
    const detail = error instanceof Error ? error.message : String(error);
    return `Dead-letter replay backend failed for queue ${queueName}: ${detail}`;
}
function normalizeReason(reason) {
    return typeof reason === "string" ? reason.trim() : null;
}
function requireNonEmpty(value, code) {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error(code);
    }
    return normalized;
}
//# sourceMappingURL=dead-letter-replay.worker.js.map