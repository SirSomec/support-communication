import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  createVerifiedInboundWebhookNormalizationDescriptor,
  InMemorySignedWebhookNonceStore,
  JsonFileSignedWebhookNonceStore,
  PrismaSignedWebhookNonceStore,
  verifySignedWebhookNonce,
  verifySignedWebhookSignature,
  verifySignedWebhookTimestamp
} from "../apps/api-gateway/src/integrations/signed-webhook-verifier.ts";

describe("signed inbound webhook verification contracts", () => {
  it("accepts timestamps inside tolerance and rejects stale, future, missing and malformed timestamps", () => {
    const now = "2026-06-30T13:00:00.000Z";

    const current = verifySignedWebhookTimestamp({
      now,
      timestampHeader: "2026-06-30T13:00:00.000Z"
    });
    const boundaryPast = verifySignedWebhookTimestamp({
      now,
      timestampHeader: "2026-06-30T12:55:00.000Z"
    });
    const stale = verifySignedWebhookTimestamp({
      now,
      timestampHeader: "2026-06-30T12:54:59.000Z"
    });
    const future = verifySignedWebhookTimestamp({
      now,
      timestampHeader: "2026-06-30T13:05:01.000Z"
    });
    const missing = verifySignedWebhookTimestamp({ now });
    const malformed = verifySignedWebhookTimestamp({
      now,
      timestampHeader: "not-a-date"
    });

    assert.deepEqual(current, {
      accepted: true,
      ageSeconds: 0,
      timestamp: "2026-06-30T13:00:00.000Z"
    });
    assert.deepEqual(boundaryPast, {
      accepted: true,
      ageSeconds: 300,
      timestamp: "2026-06-30T12:55:00.000Z"
    });
    assert.deepEqual(stale, {
      accepted: false,
      code: "webhook_timestamp_outside_tolerance",
      skewSeconds: -301
    });
    assert.deepEqual(future, {
      accepted: false,
      code: "webhook_timestamp_outside_tolerance",
      skewSeconds: 301
    });
    assert.deepEqual(missing, {
      accepted: false,
      code: "webhook_timestamp_required",
      skewSeconds: null
    });
    assert.deepEqual(malformed, {
      accepted: false,
      code: "webhook_timestamp_malformed",
      skewSeconds: null
    });
  });

  it("accepts matching HMAC signatures and rejects mismatched, missing and malformed signatures", () => {
    const body = JSON.stringify({ event: "message_new", id: "evt-signed-001" });
    const secret = "webhook_signature_contract_secret";
    const timestampHeader = "2026-06-30T13:00:00.000Z";
    const signatureHeader = `sha256=${createHmac("sha256", secret)
      .update(`${timestampHeader}.${body}`)
      .digest("hex")}`;

    const accepted = verifySignedWebhookSignature({
      body,
      secret,
      signatureHeader,
      timestampHeader
    });
    const tamperedBody = verifySignedWebhookSignature({
      body: JSON.stringify({ event: "message_new", id: "evt-signed-tampered" }),
      secret,
      signatureHeader,
      timestampHeader
    });
    const tamperedTimestamp = verifySignedWebhookSignature({
      body,
      secret,
      signatureHeader,
      timestampHeader: "2026-06-30T13:00:01.000Z"
    });
    const missing = verifySignedWebhookSignature({
      body,
      secret,
      timestampHeader
    });
    const malformed = verifySignedWebhookSignature({
      body,
      secret,
      signatureHeader: "sha256=not-hex",
      timestampHeader
    });

    assert.deepEqual(accepted, { accepted: true });
    assert.deepEqual(tamperedBody, {
      accepted: false,
      code: "webhook_signature_mismatch"
    });
    assert.deepEqual(tamperedTimestamp, {
      accepted: false,
      code: "webhook_signature_mismatch"
    });
    assert.deepEqual(missing, {
      accepted: false,
      code: "webhook_signature_required"
    });
    assert.deepEqual(malformed, {
      accepted: false,
      code: "webhook_signature_malformed"
    });
    assert.equal(JSON.stringify([tamperedBody, tamperedTimestamp, missing, malformed]).includes(secret), false);
  });

  it("accepts a signed webhook nonce once per endpoint and rejects endpoint-local replay", async () => {
    const store = new InMemorySignedWebhookNonceStore();

    const first = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      nonceHeader: "nonce-contract-001",
      receivedAt: "2026-06-30T13:01:00.000Z",
      store
    });
    const replay = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      nonceHeader: "nonce-contract-001",
      receivedAt: "2026-06-30T13:01:02.000Z",
      store
    });
    const sameTimestampReplay = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      nonceHeader: "nonce-contract-001",
      receivedAt: "2026-06-30T13:01:00.000Z",
      store
    });
    const differentEndpoint = await verifySignedWebhookNonce({
      endpointId: "telegram-main",
      nonceHeader: "nonce-contract-001",
      receivedAt: "2026-06-30T13:01:03.000Z",
      store
    });
    const missing = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      receivedAt: "2026-06-30T13:01:04.000Z",
      store
    });

    assert.deepEqual(first, {
      accepted: true,
      endpointId: "vk-inbound",
      nonce: "nonce-contract-001"
    });
    assert.deepEqual(replay, {
      accepted: false,
      code: "webhook_nonce_replay",
      endpointId: "vk-inbound",
      firstSeenAt: "2026-06-30T13:01:00.000Z",
      nonce: "nonce-contract-001"
    });
    assert.deepEqual(sameTimestampReplay, {
      accepted: false,
      code: "webhook_nonce_replay",
      endpointId: "vk-inbound",
      firstSeenAt: "2026-06-30T13:01:00.000Z",
      nonce: "nonce-contract-001"
    });
    assert.deepEqual(differentEndpoint, {
      accepted: true,
      endpointId: "telegram-main",
      nonce: "nonce-contract-001"
    });
    assert.deepEqual(missing, {
      accepted: false,
      code: "webhook_nonce_required"
    });
  });

  it("persists signed webhook nonce replay protection across JSON store reopen", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "signed-webhook-nonce-"));
    try {
      const filePath = join(workspace, "nonce-store.json");
      const firstStore = JsonFileSignedWebhookNonceStore.open({ filePath });

      const first = await verifySignedWebhookNonce({
        endpointId: "vk-inbound",
        nonceHeader: "nonce-json-001",
        receivedAt: "2026-06-30T13:02:00.000Z",
        store: firstStore
      });

      const reopenedStore = JsonFileSignedWebhookNonceStore.open({ filePath });
      const replay = await verifySignedWebhookNonce({
        endpointId: "vk-inbound",
        nonceHeader: "nonce-json-001",
        receivedAt: "2026-06-30T13:03:00.000Z",
        store: reopenedStore
      });

      assert.deepEqual(first, {
        accepted: true,
        endpointId: "vk-inbound",
        nonce: "nonce-json-001"
      });
      assert.deepEqual(replay, {
        accepted: false,
        code: "webhook_nonce_replay",
        endpointId: "vk-inbound",
        firstSeenAt: "2026-06-30T13:02:00.000Z",
        nonce: "nonce-json-001"
      });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists signed webhook nonce replay protection through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaSignedWebhookNonceClient();
    const store = PrismaSignedWebhookNonceStore.create({ client });

    const first = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      nonceHeader: "nonce-prisma-001",
      receivedAt: "2026-06-30T13:04:00.000Z",
      store
    });
    const replay = await verifySignedWebhookNonce({
      endpointId: "vk-inbound",
      nonceHeader: "nonce-prisma-001",
      receivedAt: "2026-06-30T13:04:02.000Z",
      store
    });
    const differentEndpoint = await verifySignedWebhookNonce({
      endpointId: "telegram-main",
      nonceHeader: "nonce-prisma-001",
      receivedAt: "2026-06-30T13:04:03.000Z",
      store
    });

    assert.deepEqual(first, {
      accepted: true,
      endpointId: "vk-inbound",
      nonce: "nonce-prisma-001"
    });
    assert.deepEqual(replay, {
      accepted: false,
      code: "webhook_nonce_replay",
      endpointId: "vk-inbound",
      firstSeenAt: "2026-06-30T13:04:00.000Z",
      nonce: "nonce-prisma-001"
    });
    assert.deepEqual(differentEndpoint, {
      accepted: true,
      endpointId: "telegram-main",
      nonce: "nonce-prisma-001"
    });
    assert.deepEqual(calls.creates[0], {
      data: {
        endpointId: "vk-inbound",
        firstSeenAt: new Date("2026-06-30T13:04:00.000Z"),
        nonce: "nonce-prisma-001"
      }
    });
    assert.equal(JSON.stringify(calls.creates).includes("signature"), false);
    assert.equal(JSON.stringify(calls.creates).includes("secret"), false);
  });

  it("creates normalization descriptors only for verified signed inbound webhooks", async () => {
    const store = new InMemorySignedWebhookNonceStore();
    const body = JSON.stringify({
      conversationId: "maria",
      eventId: "vk_evt_verified_001",
      text: "Verified signed webhook"
    });
    const secret = "normalization_descriptor_secret";
    const timestampHeader = "2026-06-30T13:05:00.000Z";
    const signatureHeader = `sha256=${createHmac("sha256", secret)
      .update(`${timestampHeader}.${body}`)
      .digest("hex")}`;

    const accepted = await createVerifiedInboundWebhookNormalizationDescriptor({
      body,
      channel: "vk",
      endpointId: "vk-inbound",
      nonceHeader: "nonce-normalization-001",
      now: "2026-06-30T13:05:03.000Z",
      secret,
      signatureHeader,
      timestampHeader,
      store
    });
    const replay = await createVerifiedInboundWebhookNormalizationDescriptor({
      body,
      channel: "vk",
      endpointId: "vk-inbound",
      nonceHeader: "nonce-normalization-001",
      now: "2026-06-30T13:05:04.000Z",
      secret,
      signatureHeader,
      timestampHeader,
      store
    });

    assert.deepEqual(accepted, {
      accepted: true,
      descriptor: {
        channel: "vk",
        endpointId: "vk-inbound",
        id: "signed_webhook_vk-inbound_nonce-normalization-001",
        kind: "inbound_webhook_normalization",
        normalizationPayload: {
          conversationId: "maria",
          eventId: "vk_evt_verified_001",
          text: "Verified signed webhook"
        },
        receivedAt: "2026-06-30T13:05:00.000Z",
        target: {
          operation: "normalizeInboundEvent",
          service: "channelService"
        }
      }
    });
    assert.deepEqual(replay, {
      accepted: false,
      code: "webhook_nonce_replay",
      descriptor: null,
      replay: {
        endpointId: "vk-inbound",
        firstSeenAt: "2026-06-30T13:05:00.000Z",
        nonce: "nonce-normalization-001"
      }
    });
    assert.equal(JSON.stringify(accepted).includes(secret), false);
    assert.equal(JSON.stringify(accepted).includes(signatureHeader), false);
    assert.equal(accepted.accepted, true);
    assert.equal(Object.hasOwn(accepted.descriptor, "body"), false);
  });
});

function createFakePrismaSignedWebhookNonceClient() {
  const rows = new Map<string, FakeSignedWebhookReplayNonceRow>();
  const calls: {
    creates: Array<{ data: FakeSignedWebhookReplayNonceCreateInput }>;
    findUnique: Array<{ where: { endpointId_nonce: { endpointId: string; nonce: string } } }>;
  } = {
    creates: [],
    findUnique: []
  };
  const client = {
    signedWebhookReplayNonce: {
      async create(input: { data: FakeSignedWebhookReplayNonceCreateInput }): Promise<FakeSignedWebhookReplayNonceRow> {
        calls.creates.push(clone(input));
        const key = fakeNonceKey(input.data.endpointId, input.data.nonce);
        if (rows.has(key)) {
          const error = new Error("fake_prisma_signed_webhook_nonce_duplicate") as Error & { code?: string };
          error.code = "P2002";
          throw error;
        }

        const row = { ...clone(input.data), createdAt: new Date("2026-06-30T13:04:01.000Z") };
        rows.set(key, row);

        return clone(row);
      },
      async findUnique(input: {
        where: { endpointId_nonce: { endpointId: string; nonce: string } };
      }): Promise<FakeSignedWebhookReplayNonceRow | null> {
        calls.findUnique.push(clone(input));
        const { endpointId, nonce } = input.where.endpointId_nonce;

        return clone(rows.get(fakeNonceKey(endpointId, nonce)) ?? null);
      }
    }
  };

  return { calls, client };
}

interface FakeSignedWebhookReplayNonceCreateInput {
  endpointId: string;
  firstSeenAt: Date;
  nonce: string;
}

interface FakeSignedWebhookReplayNonceRow extends FakeSignedWebhookReplayNonceCreateInput {
  createdAt: Date;
}

function fakeNonceKey(endpointId: string, nonce: string): string {
  return `${endpointId}\u0000${nonce}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item) => {
    if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item)) {
      return new Date(item);
    }

    return item;
  }) as T;
}
