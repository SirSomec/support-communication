import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOutboxEvent } from "@support-communication/events";
import {
  createExternalChannelOutboxHandlers,
  createTenantMaxChannelConnector,
  createTenantVkChannelConnector,
  type WorkerHttpRequestInit
} from "../apps/outbox-worker/src/index.ts";

describe("official VK/MAX outbound connectors", () => {
  it("sends VK messages through messages.send with per-connection credentials", async () => {
    let call: { init: WorkerHttpRequestInit; url: string } | undefined;
    const connector = createTenantVkChannelConnector({
      apiBaseUrl: "https://api.vk.com",
      fetcher: async (url, init) => {
        call = { init, url };
        return { ok: true, status: 200, text: async () => JSON.stringify({ response: 91 }) };
      },
      resolveCredential: async (input) => {
        assert.deepEqual(input, { channelConnectionId: "conn-vk", provider: "vk", tenantId: "tenant-a" });
        return { accessToken: "vk-secret-token", apiVersion: "5.199", externalAccountId: "group-1" };
      }
    });
    const delivered = await connector.deliverMessage(request("VK", "conn-vk", "peer-7"));
    assert.equal(delivered?.providerMessageId, "91");
    assert.equal(call?.url, "https://api.vk.com/method/messages.send");
    const form = new URLSearchParams(call?.init.body);
    assert.equal(form.get("access_token"), "vk-secret-token");
    assert.equal(form.get("peer_id"), "peer-7");
    assert.equal(form.get("message"), "Operator reply");
    assert.equal(form.get("v"), "5.199");
  });

  it("uploads a VK image and sends its saved provider attachment id", async () => {
    let messageBody = "";
    const connector = createTenantVkChannelConnector({
      apiBaseUrl: "https://api.vk.com",
      fetcher: async (url, init) => {
        if (url.endsWith("/method/photos.getMessagesUploadServer")) return { ok: true, status: 200, text: async () => JSON.stringify({ response: { upload_url: "https://upload.vk.test/photo" } }) };
        if (url === "https://storage.test/vk-photo") return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => new Uint8Array([4, 5]).buffer };
        if (url === "https://upload.vk.test/photo") return { ok: true, status: 200, text: async () => JSON.stringify({ server: 1, photo: "photo-json", hash: "hash-1" }) };
        if (url.endsWith("/method/photos.saveMessagesPhoto")) return { ok: true, status: 200, text: async () => JSON.stringify({ response: [{ owner_id: -7, id: 42, access_key: "key-1" }] }) };
        messageBody = String(init.body ?? "");
        return { ok: true, status: 200, text: async () => JSON.stringify({ response: 92 }) };
      },
      resolveCredential: async () => ({ accessToken: "vk-secret-token", apiVersion: "5.199", externalAccountId: "group-1" })
    });
    await connector.deliverMessage({
      ...request("VK", "conn-vk", "peer-7"),
      attachments: [{ fileId: "file-vk", fileName: "photo.png", mimeType: "image/png", signedFile: { expiresAt: "2099-01-01T00:00:00.000Z", method: "GET", url: "https://storage.test/vk-photo" } }]
    });
    assert.equal(new URLSearchParams(messageBody).get("attachment"), "photo-7_42_key-1");
  });

  it("sends MAX messages with Authorization and chat_id", async () => {
    let call: { init: WorkerHttpRequestInit; url: string } | undefined;
    const connector = createTenantMaxChannelConnector({
      apiBaseUrl: "https://platform-api2.max.ru",
      fetcher: async (url, init) => {
        call = { init, url };
        return { ok: true, status: 200, text: async () => JSON.stringify({ message: { body: { mid: "mid-7" } } }) };
      },
      resolveCredential: async () => ({ accessToken: "max-secret-token", externalAccountId: "bot-1" })
    });
    const delivered = await connector.deliverMessage(request("MAX", "conn-max", "chat 7"));
    assert.equal(delivered?.providerMessageId, "mid-7");
    assert.equal(call?.url, "https://platform-api2.max.ru/messages?chat_id=chat%207");
    assert.equal(call?.init.headers.authorization, "max-secret-token");
    assert.deepEqual(JSON.parse(call?.init.body ?? "{}"), { text: "Operator reply" });
  });

  it("uploads a MAX attachment once and reuses its durable token", async () => {
    const calls: string[] = [];
    let transfer: any = null;
    const transferStore = {
      find: async () => transfer,
      upsert: async (key: any) => transfer ??= { ...key, attempts: 0, createdAt: new Date().toISOString(), error: null, id: "pat-1", providerAttachmentId: null, providerAttachmentToken: null, status: "pending", updatedAt: new Date().toISOString() },
      markAttempt: async () => ({ ...transfer, attempts: ++transfer.attempts }),
      markFailed: async (input: any) => transfer = { ...transfer, error: input.error, status: "failed" },
      markUploaded: async (input: any) => transfer = { ...transfer, providerAttachmentToken: input.providerAttachmentToken, status: "uploaded" }
    };
    const connector = createTenantMaxChannelConnector({
      apiBaseUrl: "https://platform-api2.max.ru",
      fetcher: async (url) => {
        calls.push(url);
        if (url === "https://storage.test/file-1") return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
        if (url.endsWith("/uploads?type=image")) return { ok: true, status: 200, text: async () => JSON.stringify({ url: "https://upload.max.test/u1" }) };
        if (url === "https://upload.max.test/u1") return { ok: true, status: 200, text: async () => JSON.stringify({ token: "max-file-token" }) };
        return { ok: true, status: 200, text: async () => JSON.stringify({ message: { body: { mid: `mid-${calls.length}` } } }) };
      },
      providerAttachmentTransferStore: transferStore,
      resolveCredential: async () => ({ accessToken: "max-secret-token", externalAccountId: "bot-1" })
    });
    const attachment = { fileId: "file-1", fileName: "photo.png", mimeType: "image/png", signedFile: { expiresAt: "2099-01-01T00:00:00.000Z", method: "GET", url: "https://storage.test/file-1" } };
    await connector.deliverMessage({ ...request("MAX", "conn-max", "chat-7"), attachments: [attachment] });
    await connector.deliverMessage({ ...request("MAX", "conn-max", "chat-7"), attachments: [attachment] });
    assert.equal(calls.filter((url) => url === "https://storage.test/file-1").length, 1);
    assert.equal(calls.filter((url) => url.endsWith("/uploads?type=image")).length, 1);
    assert.equal(transfer.providerAttachmentToken, "max-file-token");
    assert.equal(transfer.status, "uploaded");
  });

  it("bounds VK and MAX attachment provider requests with the connector timeout", async () => {
    const vk = createTenantVkChannelConnector({
      apiBaseUrl: "https://api.vk.com",
      fetcher: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }),
      resolveCredential: async () => ({ accessToken: "vk-secret-token", apiVersion: "5.199", externalAccountId: "group-1" }),
      timeoutMs: 10
    });
    await assert.rejects(
      () => vk.deliverMessage({
        ...request("VK", "conn-vk", "peer-7"),
        attachments: [{
          fileId: "file-vk-timeout",
          fileName: "photo.png",
          mimeType: "image/png",
          signedFile: { expiresAt: "2099-01-01T00:00:00.000Z", method: "GET", url: "https://storage.test/vk-timeout" }
        }]
      }),
      /vk_upload_server_failed_timeout:10/
    );

    const max = createTenantMaxChannelConnector({
      apiBaseUrl: "https://platform-api2.max.ru",
      fetcher: async (url, init) => {
        if (url === "https://storage.test/max-timeout") {
          return { ok: true, status: 200, text: async () => "", arrayBuffer: async () => new Uint8Array([1]).buffer };
        }
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      },
      resolveCredential: async () => ({ accessToken: "max-secret-token", externalAccountId: "bot-1" }),
      timeoutMs: 10
    });
    await assert.rejects(
      () => max.deliverMessage({
        ...request("MAX", "conn-max", "chat-7"),
        attachments: [{
          fileId: "file-max-timeout",
          fileName: "photo.png",
          mimeType: "image/png",
          signedFile: { expiresAt: "2099-01-01T00:00:00.000Z", method: "GET", url: "https://storage.test/max-timeout" }
        }]
      }),
      /max_upload_descriptor_failed_timeout:10/
    );
  });

  it("persists provider message binding before marking a descriptor delivered", async () => {
    const transitions: string[] = [];
    const bindings: Array<Record<string, unknown>> = [];
    const handlers = createExternalChannelOutboxHandlers({
      channelConnectors: {
        VK: { deliverMessage: async () => ({ providerMessageId: "vk-mid-42" }), startConversation: async () => undefined }
      },
      outboundDescriptorStore: {
        findOutboundDescriptorById: async () => ({
          channel: "VK", conversationId: "conversation-1", id: "descriptor-1", idempotencyKey: "idem-1",
          kind: "message_delivery", messageId: "message-1",
          payload: { channelConnectionId: "conn-vk", providerConversationId: "peer-7", text: "Reply" }, tenantId: "tenant-a"
        }),
        markOutboundDescriptorDelivery: async (_id, state) => { transitions.push(state); return null; },
        recordProviderMessageBinding: async (input) => { bindings.push(input); }
      },
      writeLog: () => undefined
    });
    await handlers["message.delivery.requested"](createOutboxEvent({
      aggregateId: "conversation-1", aggregateType: "conversation", payload: { descriptorId: "descriptor-1" },
      queue: "message-delivery", traceId: "trace-1", type: "message.delivery.requested"
    }));
    assert.deepEqual(transitions, ["delivered"]);
    assert.deepEqual(bindings, [{
      channelConnectionId: "conn-vk", conversationId: "conversation-1", internalMessageId: "message-1", provider: "vk",
      providerConversationId: "peer-7", providerMessageId: "vk-mid-42", tenantId: "tenant-a"
    }]);
  });
});

function request(channel: string, channelConnectionId: string, conversationId: string) {
  return {
    channel,
    channelConnectionId,
    conversationId,
    descriptorId: "descriptor-1",
    idempotencyKey: "idempotency-1",
    messageId: "message-1",
    outboxEventId: "outbox-1",
    tenantId: "tenant-a",
    text: "Operator reply",
    traceId: "trace-1"
  };
}
