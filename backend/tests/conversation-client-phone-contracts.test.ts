import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";

function createService() {
  const repository = ConversationRepository.inMemory(bootstrapConversationState());
  const conversations = new ConversationService(repository, {
    identityRepository: IdentityRepository.inMemory(bootstrapIdentityState())
  });
  return { conversations, repository };
}

const scope = {
  actorId: "usr-volga-admin",
  actorName: "Sergey Markin",
  actorType: "operator" as const,
  tenantId: "tenant-volga"
};

describe("dialog client phone backend contracts", () => {
  it("saves the operator-entered phone and records lifecycle + realtime events without the number itself", async () => {
    const { conversations, repository } = createService();
    const maria = await repository.findConversation("maria");
    assert.ok(maria);
    maria.phone = "";
    await repository.saveConversation(maria);

    const updated = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "  +7 921   555-10-20 "
    }, scope);

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.changed, true);
    assert.equal(updated.data.phone, "+7 921 555-10-20");
    assert.equal(updated.data.realtimeEvent.eventName, "conversation.updated");
    assert.equal(updated.data.realtimeEvent.data.action, "client_phone");
    assert.equal(updated.data.realtimeEvent.data.phone, undefined);

    const persisted = await repository.findConversation("maria");
    assert.equal(persisted?.phone, "+7 921 555-10-20");

    const lifecycle = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    const phoneEvent = lifecycle.find((event) => event.eventType === "client.phone.changed");
    assert.ok(phoneEvent, "client.phone.changed lifecycle event must be recorded");
    assert.equal(phoneEvent.actorId, "usr-volga-admin");
    assert.deepEqual(phoneEvent.data, { hadPhone: false, hasPhone: true });
  });

  it("is idempotent: an unchanged phone does not append lifecycle events", async () => {
    const { conversations, repository } = createService();

    const first = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "+7 921 555-10-20"
    }, scope);
    assert.equal(first.status, "ok");
    assert.equal(first.data.changed, true);

    const second = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "+7 921 555-10-20"
    }, scope);
    assert.equal(second.status, "ok");
    assert.equal(second.data.changed, false);

    const lifecycle = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    assert.equal(lifecycle.filter((event) => event.eventType === "client.phone.changed").length, 1);
  });

  it("moves a legacy routing identifier into providerConversationId before overwriting", async () => {
    const { conversations, repository } = createService();
    const maria = await repository.findConversation("maria");
    assert.ok(maria);
    maria.phone = "openchat_visitor_42";
    delete maria.providerConversationId;
    await repository.saveConversation(maria);

    const updated = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "+7 921 555-10-20"
    }, scope);
    assert.equal(updated.status, "ok");

    const persisted = await repository.findConversation("maria");
    assert.equal(persisted?.phone, "+7 921 555-10-20");
    assert.equal(persisted?.providerConversationId, "openchat_visitor_42");
  });

  it("allows clearing the phone and validates the format", async () => {
    const { conversations, repository } = createService();

    const cleared = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: ""
    }, scope);
    assert.equal(cleared.status, "ok");
    assert.equal(cleared.data.changed, true);
    assert.equal((await repository.findConversation("maria"))?.phone, "");

    const notString = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: 79215551020
    }, scope);
    assert.equal(notString.status, "invalid");
    assert.equal(notString.error?.code, "phone_string_required");

    const withLetters = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "visitor_42"
    }, scope);
    assert.equal(withLetters.status, "invalid");
    assert.equal(withLetters.error?.code, "phone_invalid");

    const tooShort = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "1234"
    }, scope);
    assert.equal(tooShort.status, "invalid");
    assert.equal(tooShort.error?.code, "phone_invalid");
  });

  it("keeps tenant isolation for foreign and unknown dialogs", async () => {
    const { conversations } = createService();

    const foreign = await conversations.updateConversationClientPhone({
      conversationId: "maria",
      phone: "+7 921 555-10-20"
    }, { ...scope, tenantId: "tenant-northstar" });
    assert.equal(foreign.status, "not_found");
    assert.equal(foreign.error?.code, "conversation_not_found");

    const missing = await conversations.updateConversationClientPhone({
      conversationId: "ghost",
      phone: "+7 921 555-10-20"
    }, scope);
    assert.equal(missing.status, "not_found");
  });
});
