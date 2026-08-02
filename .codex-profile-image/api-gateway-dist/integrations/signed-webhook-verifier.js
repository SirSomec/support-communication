import { createHmac, timingSafeEqual } from "node:crypto";
const DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;
export class InMemorySignedWebhookNonceStore {
    nonces = new Map();
    async saveNonce(record) {
        const key = nonceKey(record.endpointId, record.nonce);
        const existing = this.nonces.get(key);
        if (existing) {
            return { inserted: false, record: { ...existing } };
        }
        const persisted = { ...record };
        this.nonces.set(key, persisted);
        return { inserted: true, record: { ...persisted } };
    }
}
export class PrismaSignedWebhookNonceStore {
    client;
    constructor(client) {
        this.client = client;
    }
    static create(options) {
        return new PrismaSignedWebhookNonceStore(options.client);
    }
    async saveNonce(record) {
        const persisted = normalizeNonceRecord(record);
        try {
            const row = await this.client.signedWebhookReplayNonce.create({
                data: {
                    endpointId: persisted.endpointId,
                    firstSeenAt: new Date(persisted.firstSeenAt),
                    nonce: persisted.nonce
                }
            });
            return {
                inserted: true,
                record: toSignedWebhookNonceRecord(row)
            };
        }
        catch (error) {
            if (!isPrismaUniqueConstraintError(error)) {
                throw error;
            }
            const existing = await this.client.signedWebhookReplayNonce.findUnique({
                where: {
                    endpointId_nonce: {
                        endpointId: persisted.endpointId,
                        nonce: persisted.nonce
                    }
                }
            });
            if (!existing) {
                throw error;
            }
            return {
                inserted: false,
                record: toSignedWebhookNonceRecord(existing)
            };
        }
    }
}
export function verifySignedWebhookTimestamp(input) {
    const rawTimestamp = String(input.timestampHeader ?? "").trim();
    if (!rawTimestamp) {
        return {
            accepted: false,
            code: "webhook_timestamp_required",
            skewSeconds: null
        };
    }
    const timestampMs = Date.parse(rawTimestamp);
    const nowMs = Date.parse(input.now);
    if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
        return {
            accepted: false,
            code: "webhook_timestamp_malformed",
            skewSeconds: null
        };
    }
    const skewSeconds = Math.trunc((timestampMs - nowMs) / 1000);
    const toleranceSeconds = input.toleranceSeconds ?? DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;
    if (Math.abs(skewSeconds) > toleranceSeconds) {
        return {
            accepted: false,
            code: "webhook_timestamp_outside_tolerance",
            skewSeconds
        };
    }
    return {
        accepted: true,
        ageSeconds: Math.abs(skewSeconds),
        timestamp: new Date(timestampMs).toISOString()
    };
}
export function verifySignedWebhookSignature(input) {
    const signature = parseWebhookSignature(input.signatureHeader);
    if (!signature) {
        return {
            accepted: false,
            code: String(input.signatureHeader ?? "").trim() ? "webhook_signature_malformed" : "webhook_signature_required"
        };
    }
    const expected = createHmac("sha256", input.secret)
        .update(`${input.timestampHeader}.${input.body}`)
        .digest("hex");
    if (!safeEqualHex(signature, expected)) {
        return {
            accepted: false,
            code: "webhook_signature_mismatch"
        };
    }
    return { accepted: true };
}
export async function verifySignedWebhookNonce(input) {
    const nonce = String(input.nonceHeader ?? "").trim();
    if (!nonce) {
        return {
            accepted: false,
            code: "webhook_nonce_required"
        };
    }
    const saved = await input.store.saveNonce({
        endpointId: input.endpointId,
        firstSeenAt: input.receivedAt,
        nonce
    });
    if (!saved.inserted) {
        return {
            accepted: false,
            code: "webhook_nonce_replay",
            endpointId: input.endpointId,
            firstSeenAt: saved.record.firstSeenAt,
            nonce
        };
    }
    return {
        accepted: true,
        endpointId: input.endpointId,
        nonce
    };
}
export async function createVerifiedInboundWebhookNormalizationDescriptor(input) {
    const timestamp = verifySignedWebhookTimestamp({
        now: input.now,
        timestampHeader: input.timestampHeader
    });
    if (!timestamp.accepted) {
        return {
            accepted: false,
            code: timestamp.code,
            descriptor: null
        };
    }
    const signature = verifySignedWebhookSignature({
        body: input.body,
        secret: input.secret,
        signatureHeader: input.signatureHeader,
        timestampHeader: input.timestampHeader ?? ""
    });
    if (!signature.accepted) {
        return {
            accepted: false,
            code: signature.code,
            descriptor: null
        };
    }
    const nonce = await verifySignedWebhookNonce({
        endpointId: input.endpointId,
        nonceHeader: input.nonceHeader,
        receivedAt: timestamp.timestamp,
        store: input.store
    });
    if (!nonce.accepted) {
        return {
            accepted: false,
            code: nonce.code,
            descriptor: null,
            ...(nonce.code === "webhook_nonce_replay"
                ? {
                    replay: {
                        endpointId: nonce.endpointId,
                        firstSeenAt: nonce.firstSeenAt,
                        nonce: nonce.nonce
                    }
                }
                : {})
        };
    }
    const payload = parseNormalizationPayload(input.body);
    if (!payload) {
        return {
            accepted: false,
            code: "webhook_payload_malformed",
            descriptor: null
        };
    }
    return {
        accepted: true,
        descriptor: {
            channel: input.channel,
            endpointId: input.endpointId,
            id: `signed_webhook_${input.endpointId}_${nonce.nonce}`,
            kind: "inbound_webhook_normalization",
            normalizationPayload: payload,
            receivedAt: timestamp.timestamp,
            target: {
                operation: "normalizeInboundEvent",
                service: "channelService"
            }
        }
    };
}
function nonceKey(endpointId, nonce) {
    return `${endpointId}\u0000${nonce}`;
}
function normalizeNonceRecord(record) {
    return {
        endpointId: record.endpointId,
        firstSeenAt: record.firstSeenAt,
        nonce: record.nonce
    };
}
function toSignedWebhookNonceRecord(row) {
    return {
        endpointId: row.endpointId,
        firstSeenAt: row.firstSeenAt.toISOString(),
        nonce: row.nonce
    };
}
function parseNormalizationPayload(body) {
    try {
        const parsed = JSON.parse(body);
        const conversationId = String(parsed.conversationId ?? "").trim();
        const eventId = String(parsed.eventId ?? "").trim();
        const text = String(parsed.text ?? "").trim();
        return conversationId && eventId && text
            ? { conversationId, eventId, text }
            : null;
    }
    catch {
        return null;
    }
}
function isPrismaUniqueConstraintError(error) {
    return error !== null
        && typeof error === "object"
        && "code" in error
        && error.code === "P2002";
}
function parseWebhookSignature(signatureHeader) {
    const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader ?? "").trim());
    return match?.[1]?.toLowerCase() ?? null;
}
function safeEqualHex(left, right) {
    if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
        return false;
    }
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
//# sourceMappingURL=signed-webhook-verifier.js.map