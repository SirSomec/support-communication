import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { AiConnectionsService, type AiConnectionTestProviderFactory } from "../apps/api-gateway/src/ai-connections/ai-connections.service.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";

const environment = {
  AI_CONNECTIONS_KEY_VERSION: "test-v1",
  AI_CONNECTIONS_MASTER_KEY: Buffer.alloc(32, 7).toString("base64")
};

describe("tenant AI connection service", () => {
  it("stores only encrypted credentials, audits the write and keeps tenant metadata isolated", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const service = new AiConnectionsService(repository, environment, undefined, audit);
    const created = await service.create("tenant-volga", {
      baseUrl: "https://provider.example.test/v1",
      capabilities: ["chat_completion", "embeddings"],
      chatModel: "support-model",
      secret: "super-secret-key"
    });

    assert.equal(created.status, "ok");
    assert.equal(JSON.stringify(created).includes("super-secret-key"), false);
    const connection = created.data.connection as { id: string; secretConfigured: boolean; status: string };
    assert.equal(connection.secretConfigured, true);
    assert.equal(connection.status, "disabled");
    assert.equal(repository.list("tenant-volga")[0]?.secret.ciphertext.includes("super-secret-key"), false);
    assert.equal(service.list("tenant-ladoga").data.connections.length, 0);
    const events = await audit.listServiceAdminAuditEvents();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.action, "ai.connection.create");
    assert.equal(events[0]?.immutable, true);
    assert.equal(JSON.stringify(events).includes("super-secret-key"), false);
  });

  it("rotates a secret without exposing it and disables the connection until re-tested", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const service = new AiConnectionsService(repository, environment, undefined, audit);
    const created = await service.create("tenant-volga", { baseUrl: "https://provider.example.test", chatModel: "model", secret: "first" });
    const id = String((created.data.connection as { id: string }).id);
    const rotated = await service.rotate("tenant-volga", id, { secret: "second" });

    assert.equal(rotated.status, "ok");
    assert.equal(JSON.stringify(rotated).includes("second"), false);
    assert.equal((rotated.data.connection as { status: string }).status, "disabled");
    const events = await audit.listServiceAdminAuditEvents();
    assert.equal(events.some((event) => event.action === "ai.connection.rotate" && event.immutable), true);
  });

  it("rejects cross-tenant update, disable and deletion without creating an audit event", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const service = new AiConnectionsService(repository, environment, undefined, audit);
    const created = await service.create("tenant-volga", { baseUrl: "https://provider.example.test", chatModel: "model", secret: "first" });
    const id = String((created.data.connection as { id: string }).id);

    assert.equal((await service.update("tenant-ladoga", id, { chatModel: "other" })).error?.code, "ai_connection_not_found");
    assert.equal((await service.disable("tenant-ladoga", id)).error?.code, "ai_connection_not_found");
    assert.equal((await service.remove("tenant-ladoga", id)).error?.code, "ai_connection_not_found");
    assert.equal(repository.find("tenant-volga", id)?.chatModel, "model");
    assert.equal((await audit.listServiceAdminAuditEvents()).length, 1);
  });

  it("runs a bounded empty-data connectivity check and persists only a masked diagnostic and trace", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    let request: { maxTokens?: number; messages: Array<{ content: string }> } | null = null;
    const providerFactory: AiConnectionTestProviderFactory = () => ({
      model: "model",
      providerId: "openai-compatible-chat",
      async complete(input) {
        request = input;
        return { content: "OK", model: "model", providerId: "openai-compatible-chat", providerRequestId: "provider-request", usage: {} };
      }
    });
    const service = new AiConnectionsService(repository, environment, undefined, audit, providerFactory);
    const created = await service.create("tenant-volga", { baseUrl: "https://provider.example.test", chatModel: "model", secret: "never-leak" });
    const id = String((created.data.connection as { id: string }).id);
    const tested = await service.test("tenant-volga", id);

    assert.equal(tested.status, "ok");
    assert.deepEqual(request, { maxTokens: 1, messages: [{ content: "Reply with OK.", role: "user" }], temperature: 0 });
    assert.equal(JSON.stringify(tested).includes("never-leak"), false);
    assert.equal(JSON.stringify(tested).includes("provider-request"), false);
    const test = tested.data.test as { diagnostic: { code: string; traceId: string } };
    assert.equal(test.diagnostic.code, "ok");
    assert.equal(test.diagnostic.traceId, tested.traceId);
    assert.equal(repository.find("tenant-volga", id)?.lastTestMessage, null);
    assert.equal((await audit.listServiceAdminAuditEvents()).some((event) => event.action === "ai.connection.test" && event.immutable), true);
  });

  it("masks provider failures, stores no raw response and audits the failed test", async () => {
    const repository = AiConnectionRepository.inMemory();
    const audit = IdentityRepository.inMemory();
    const providerFactory: AiConnectionTestProviderFactory = () => ({
      model: "model", providerId: "openai-compatible-chat",
      async complete() { throw new Error("provider returned customer-text: private data"); }
    });
    const service = new AiConnectionsService(repository, environment, undefined, audit, providerFactory);
    const created = await service.create("tenant-volga", { baseUrl: "https://provider.example.test", chatModel: "model", secret: "never-leak" });
    const id = String((created.data.connection as { id: string }).id);
    const tested = await service.test("tenant-volga", id);

    assert.equal(tested.error?.message, "AI connection test failed. Check the diagnostic trace.");
    assert.equal(JSON.stringify(tested).includes("private data"), false);
    assert.equal(repository.find("tenant-volga", id)?.lastTestMessage, "provider_unavailable");
    assert.equal((await audit.listServiceAdminAuditEvents()).some((event) => event.action === "ai.connection.test" && event.result === "provider_unavailable"), true);
  });
});
