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

describe("dialog tags backend contracts", () => {
  it("replaces visible tags, preserves service tags and records lifecycle + realtime events", async () => {
    const { conversations, repository } = createService();
    const maria = await repository.findConversation("maria");
    assert.ok(maria);
    maria.tags = [...maria.tags, "repeat-appeal", "appeal-anchor:anchor-1"];
    await repository.saveConversation(maria);

    const updated = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: ["  Доставка ", "ВАЖНО", "доставка", "repeat-appeal", "appeal-anchor:hijack"]
    }, scope);

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.changed, true);
    assert.deepEqual(updated.data.tags, ["доставка", "важно", "repeat-appeal", "appeal-anchor:anchor-1"]);
    assert.deepEqual(updated.data.added, ["доставка", "важно"]);
    assert.deepEqual(updated.data.removed, ["delivery", "order status", "important"]);
    assert.equal(updated.data.realtimeEvent.eventName, "conversation.updated");
    assert.deepEqual(updated.data.realtimeEvent.data.action, "tags");

    const persisted = await repository.findConversation("maria");
    assert.deepEqual(persisted?.tags, ["доставка", "важно", "repeat-appeal", "appeal-anchor:anchor-1"]);

    const lifecycle = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    const tagsEvent = lifecycle.find((event) => event.eventType === "tags.changed");
    assert.ok(tagsEvent, "tags.changed lifecycle event must be recorded");
    assert.deepEqual(tagsEvent.data.added, ["доставка", "важно"]);
    assert.deepEqual(tagsEvent.data.tags, ["доставка", "важно"]);
    assert.equal(tagsEvent.actorId, "usr-volga-admin");
  });

  it("is idempotent: an unchanged payload does not append lifecycle events", async () => {
    const { conversations, repository } = createService();

    const first = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: ["доставка"]
    }, scope);
    assert.equal(first.status, "ok");
    assert.equal(first.data.changed, true);

    const second = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: ["Доставка"]
    }, scope);
    assert.equal(second.status, "ok");
    assert.equal(second.data.changed, false);
    assert.deepEqual(second.data.tags, ["доставка"]);

    const lifecycle = await repository.listLifecycleEvents({ conversationId: "maria", tenantId: "tenant-volga" });
    assert.equal(lifecycle.filter((event) => event.eventType === "tags.changed").length, 1);
  });

  it("validates the payload shape and limits", async () => {
    const { conversations } = createService();

    const notArray = await conversations.updateConversationTags({ conversationId: "maria", tags: "важно" }, scope);
    assert.equal(notArray.status, "invalid");
    assert.equal(notArray.error?.code, "tags_array_required");

    const tooLong = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: ["а".repeat(33)]
    }, scope);
    assert.equal(tooLong.status, "invalid");
    assert.equal(tooLong.error?.code, "tag_too_long");

    const tooMany = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: Array.from({ length: 21 }, (_, index) => `тег-${index}`)
    }, scope);
    assert.equal(tooMany.status, "invalid");
    assert.equal(tooMany.error?.code, "tags_limit_exceeded");
  });

  it("keeps tenant isolation for foreign and unknown dialogs", async () => {
    const { conversations } = createService();

    const foreign = await conversations.updateConversationTags({
      conversationId: "maria",
      tags: ["важно"]
    }, { ...scope, tenantId: "tenant-northstar" });
    assert.equal(foreign.status, "not_found");
    assert.equal(foreign.error?.code, "conversation_not_found");

    const missing = await conversations.updateConversationTags({
      conversationId: "ghost",
      tags: ["важно"]
    }, scope);
    assert.equal(missing.status, "not_found");
  });

  it("allows tagging a closed dialog for post-hoc categorization", async () => {
    const { conversations } = createService();

    const updated = await conversations.updateConversationTags({
      conversationId: "irina",
      tags: ["возврат", "оплата", "решено"]
    }, scope);

    assert.equal(updated.status, "ok");
    assert.deepEqual(updated.data.tags, ["возврат", "оплата", "решено"]);
  });
});
