import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { providerConversationKey, resolveOrCreateProviderConversation } from "../apps/api-gateway/src/integrations/provider-conversation.ts";

describe("provider conversation identity", () => {
  it("creates one durable conversation per tenant, connection and provider peer", async () => {
    const repository = ConversationRepository.inMemory();
    const input = {
      channel: "MAX" as const,
      channelConnectionId: "conn-max-1",
      conversationRepository: repository,
      displayName: "Max User",
      providerConversationId: "chat-42",
      providerUserId: "user-7",
      queueId: "MAX",
      tenantId: "tenant-a"
    };
    const first = await resolveOrCreateProviderConversation(input);
    const replay = await resolveOrCreateProviderConversation(input);
    assert.equal(first?.conversation.id, replay?.conversation.id);
    assert.equal(first?.conversation.channelConnectionId, "conn-max-1");
    assert.equal(first?.conversation.providerConversationId, "chat-42");
    assert.equal(first?.conversation.providerUserId, "user-7");
    assert.equal((await repository.listConversations({ tenantId: "tenant-a" })).length, 1);
  });

  it("isolates equal provider peer ids across connections and tenants", () => {
    assert.notEqual(providerConversationKey("tenant-a", "conn-1", "peer"), providerConversationKey("tenant-a", "conn-2", "peer"));
    assert.notEqual(providerConversationKey("tenant-a", "conn-1", "peer"), providerConversationKey("tenant-b", "conn-1", "peer"));
  });

  it("enriches a placeholder profile without overwriting a later operator edit", async () => {
    const repository = ConversationRepository.inMemory();
    const base = {
      channel: "VK" as const,
      channelConnectionId: "conn-vk-1",
      conversationRepository: repository,
      providerConversationId: "77",
      providerUserId: "77",
      tenantId: "tenant-a"
    };
    const created = await resolveOrCreateProviderConversation({ ...base, displayName: "VK 77" });
    const enriched = await resolveOrCreateProviderConversation({ ...base, displayName: "Анна Иванова", phone: "+7 999 123-45-67" });

    assert.equal(created?.conversation.name, "VK 77");
    assert.equal(enriched?.conversation.name, "Анна Иванова");
    assert.equal(enriched?.conversation.phone, "+7 999 123-45-67");
  });
});
