import { createHmac, timingSafeEqual } from "node:crypto";
import { JsonFileStore, type DurableStore } from "@support-communication/database";

export interface SignedWebhookTimestampVerificationInput {
  now: string;
  timestampHeader?: string;
  toleranceSeconds?: number;
}

export interface SignedWebhookSignatureVerificationInput {
  body: string;
  secret: string;
  signatureHeader?: string;
  timestampHeader: string;
}

export interface SignedWebhookNonceVerificationInput {
  endpointId: string;
  nonceHeader?: string;
  receivedAt: string;
  store: SignedWebhookNonceStore;
}

export interface VerifiedInboundWebhookNormalizationDescriptorInput {
  body: string;
  channel: string;
  endpointId: string;
  nonceHeader?: string;
  now: string;
  secret: string;
  signatureHeader?: string;
  timestampHeader?: string;
  store: SignedWebhookNonceStore;
}

export interface VerifiedInboundWebhookNormalizationDescriptor {
  channel: string;
  endpointId: string;
  id: string;
  kind: "inbound_webhook_normalization";
  normalizationPayload: {
    conversationId: string;
    eventId: string;
    text: string;
  };
  receivedAt: string;
  target: {
    operation: "normalizeInboundEvent";
    service: "channelService";
  };
}

export interface SignedWebhookNonceRecord {
  endpointId: string;
  firstSeenAt: string;
  nonce: string;
}

export interface SignedWebhookNonceStore {
  saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult>;
}

export interface SignedWebhookNonceSaveResult {
  inserted: boolean;
  record: SignedWebhookNonceRecord;
}

export interface SignedWebhookReplayDetails {
  endpointId: string;
  firstSeenAt: string;
  nonce: string;
}

export interface PrismaSignedWebhookNonceStoreOptions {
  client: PrismaSignedWebhookNonceClient;
}

export interface PrismaSignedWebhookNonceClient {
  signedWebhookReplayNonce: {
    create(input: { data: PrismaSignedWebhookReplayNonceCreateInput }): Promise<PrismaSignedWebhookReplayNonceRow>;
    findUnique(input: {
      where: {
        endpointId_nonce: {
          endpointId: string;
          nonce: string;
        };
      };
    }): Promise<PrismaSignedWebhookReplayNonceRow | null>;
  };
}

interface PrismaSignedWebhookReplayNonceCreateInput {
  endpointId: string;
  firstSeenAt: Date;
  nonce: string;
}

interface PrismaSignedWebhookReplayNonceRow extends PrismaSignedWebhookReplayNonceCreateInput {
  createdAt: Date;
}

export interface JsonFileSignedWebhookNonceStoreOptions {
  filePath: string;
}

interface SignedWebhookNonceState {
  nonces: SignedWebhookNonceRecord[];
}

export type SignedWebhookTimestampVerification =
  | {
    accepted: true;
    ageSeconds: number;
    timestamp: string;
  }
  | {
    accepted: false;
    code: "webhook_timestamp_malformed" | "webhook_timestamp_outside_tolerance" | "webhook_timestamp_required";
    skewSeconds: number | null;
  };

export type SignedWebhookSignatureVerification =
  | {
    accepted: true;
  }
  | {
    accepted: false;
    code: "webhook_signature_malformed" | "webhook_signature_mismatch" | "webhook_signature_required";
  };

export type SignedWebhookNonceVerification =
  | {
    accepted: true;
    endpointId: string;
    nonce: string;
  }
  | {
    accepted: false;
    code: "webhook_nonce_replay";
    endpointId: string;
    firstSeenAt: string;
    nonce: string;
  }
  | {
    accepted: false;
    code: "webhook_nonce_required";
  };

export type VerifiedInboundWebhookNormalizationDescriptorResult =
  | {
    accepted: true;
    descriptor: VerifiedInboundWebhookNormalizationDescriptor;
  }
  | {
    accepted: false;
    code: string;
    descriptor: null;
    replay?: SignedWebhookReplayDetails;
  };

const DEFAULT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

export class InMemorySignedWebhookNonceStore implements SignedWebhookNonceStore {
  private readonly nonces = new Map<string, SignedWebhookNonceRecord>();

  async saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult> {
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

export class JsonFileSignedWebhookNonceStore implements SignedWebhookNonceStore {
  private constructor(private readonly store: DurableStore<SignedWebhookNonceState>) {}

  static open(options: JsonFileSignedWebhookNonceStoreOptions): JsonFileSignedWebhookNonceStore {
    return new JsonFileSignedWebhookNonceStore(new JsonFileStore({
      filePath: options.filePath,
      seed: seedNonceState()
    }));
  }

  async saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult> {
    const persisted = normalizeNonceRecord(record);
    let result: SignedWebhookNonceSaveResult | undefined;
    this.store.update((state) => {
      const current = normalizeNonceState(state);
      const existing = current.nonces.find((nonce) => isSameNonce(nonce, persisted));
      if (existing) {
        result = { inserted: false, record: { ...existing } };

        return current;
      }

      result = { inserted: true, record: { ...persisted } };

      return {
        nonces: [...current.nonces, persisted]
      };
    });

    return result ?? { inserted: true, record: { ...persisted } };
  }
}

export class PrismaSignedWebhookNonceStore implements SignedWebhookNonceStore {
  private constructor(private readonly client: PrismaSignedWebhookNonceClient) {}

  static create(options: PrismaSignedWebhookNonceStoreOptions): PrismaSignedWebhookNonceStore {
    return new PrismaSignedWebhookNonceStore(options.client);
  }

  async saveNonce(record: SignedWebhookNonceRecord): Promise<SignedWebhookNonceSaveResult> {
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
    } catch (error) {
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

export function verifySignedWebhookTimestamp(
  input: SignedWebhookTimestampVerificationInput
): SignedWebhookTimestampVerification {
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

export function verifySignedWebhookSignature(
  input: SignedWebhookSignatureVerificationInput
): SignedWebhookSignatureVerification {
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

export async function verifySignedWebhookNonce(
  input: SignedWebhookNonceVerificationInput
): Promise<SignedWebhookNonceVerification> {
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

export async function createVerifiedInboundWebhookNormalizationDescriptor(
  input: VerifiedInboundWebhookNormalizationDescriptorInput
): Promise<VerifiedInboundWebhookNormalizationDescriptorResult> {
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

function nonceKey(endpointId: string, nonce: string): string {
  return `${endpointId}\u0000${nonce}`;
}

function seedNonceState(): SignedWebhookNonceState {
  return { nonces: [] };
}

function normalizeNonceState(state: Partial<SignedWebhookNonceState>): SignedWebhookNonceState {
  return {
    nonces: (state.nonces ?? []).map(normalizeNonceRecord)
  };
}

function normalizeNonceRecord(record: SignedWebhookNonceRecord): SignedWebhookNonceRecord {
  return {
    endpointId: record.endpointId,
    firstSeenAt: record.firstSeenAt,
    nonce: record.nonce
  };
}

function toSignedWebhookNonceRecord(row: PrismaSignedWebhookReplayNonceRow): SignedWebhookNonceRecord {
  return {
    endpointId: row.endpointId,
    firstSeenAt: row.firstSeenAt.toISOString(),
    nonce: row.nonce
  };
}

function isSameNonce(left: SignedWebhookNonceRecord, right: SignedWebhookNonceRecord): boolean {
  return left.endpointId === right.endpointId && left.nonce === right.nonce;
}

function parseNormalizationPayload(body: string): VerifiedInboundWebhookNormalizationDescriptor["normalizationPayload"] | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const conversationId = String(parsed.conversationId ?? "").trim();
    const eventId = String(parsed.eventId ?? "").trim();
    const text = String(parsed.text ?? "").trim();

    return conversationId && eventId && text
      ? { conversationId, eventId, text }
      : null;
  } catch {
    return null;
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}

function parseWebhookSignature(signatureHeader?: string): string | null {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(signatureHeader ?? "").trim());

  return match?.[1]?.toLowerCase() ?? null;
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
