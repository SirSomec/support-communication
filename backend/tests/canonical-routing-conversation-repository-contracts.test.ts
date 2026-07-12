import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ConversationRepository,
  createEmptyConversationState
} from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import type { ConversationRecord } from "../apps/api-gateway/src/conversation/conversation.types.ts";
import {
  CanonicalRoutingConversationNotFoundError,
  CanonicalRoutingConversationRepository
} from "../apps/api-gateway/src/routing/canonical-routing-conversation.repository.ts";

describe("canonical routing conversation repository contracts", () => {
  it("reads ConversationRepository.default with queueId as the routing queue and enforces tenant scope", async () => {
    const canonical = ConversationRepository.inMemory(seedState([
      conversation({ id: "conversation-a", queueId: "queue-priority", tenantId: "tenant-a" }),
      conversation({ id: "conversation-b", queueId: "queue-private", tenantId: "tenant-b" })
    ]));
    ConversationRepository.useDefault(canonical);
    const repository = new CanonicalRoutingConversationRepository();

    const listed = await repository.listConversations("tenant-a");
    assert.deepEqual(listed.map((item) => item.id), ["conversation-a"]);
    assert.equal(listed[0]?.channel, "queue-priority");
    assert.equal(listed[0]?.queueId, "queue-priority");
    assert.equal(listed[0]?.sourceChannel, "telegram");
    assert.equal(await repository.findConversation("conversation-b", "tenant-a"), undefined);
    await assert.rejects(
      repository.saveRoutingMutation({ action: "return_queue", conversationId: "conversation-b", tenantId: "tenant-a" }),
      CanonicalRoutingConversationNotFoundError
    );
  });

  it("atomically persists assignment and transfer through the canonical assignment API", async () => {
    const canonical = ConversationRepository.inMemory(seedState([conversation({ operatorId: undefined, status: "queued" })]));
    const repository = new CanonicalRoutingConversationRepository(canonical);

    await repository.saveRoutingMutation({
      action: "assign",
      conversationId: "conversation-1",
      mutationId: "assign-1",
      operatorId: "operator-1",
      operatorName: "First Operator",
      reason: "Initial assignment",
      tenantId: "tenant-a"
    });
    const transferred = await repository.saveRoutingMutation({
      action: "transfer",
      conversationId: "conversation-1",
      mutationId: "transfer-1",
      operatorId: "operator-2",
      operatorName: "Second Operator",
      reason: "Specialist transfer",
      tenantId: "tenant-a"
    });

    assert.equal(transferred.record.operatorId, "operator-2");
    assert.equal(transferred.record.status, "transferred");
    assert.equal(transferred.lifecycleEvent.eventType, "assignment.changed");
    assert.equal(transferred.realtimeEvent.eventName, "routing.assignment.updated");
    assert.deepEqual((await canonical.listLifecycleEvents({ tenantId: "tenant-a" })).map((event) => event.sourceEventId), ["assign-1", "transfer-1"]);
    assert.deepEqual((await canonical.listRealtimeEvents({ tenantId: "tenant-a" })).map((event) => event.eventId), ["realtime_assign-1", "realtime_transfer-1"]);
  });

  it("persists return-to-queue in the canonical snapshot with lifecycle and realtime events", async () => {
    const canonical = ConversationRepository.inMemory(seedState([conversation({ operatorId: "operator-1", status: "assigned" })]));
    const repository = new CanonicalRoutingConversationRepository(canonical);

    const returned = await repository.applyMutation({
      action: "return_queue",
      conversationId: "conversation-1",
      mutationId: "queue-1",
      queueId: "queue-escalation",
      tenantId: "tenant-a"
    });

    assert.equal(returned.record.status, "queued");
    assert.equal(returned.record.operatorId, undefined);
    assert.equal(returned.record.queueId, "queue-escalation");
    assert.equal(returned.record.slaTone, "hold");
    assert.deepEqual((await canonical.listLifecycleEvents({ tenantId: "tenant-a" })).map((event) => event.eventType), [
      "queue.entered"
    ]);
    assert.equal((await canonical.listRealtimeEvents({ tenantId: "tenant-a" }))[0]?.eventName, "routing.assignment.updated");
  });
});

function seedState(conversations: ConversationRecord[]) {
  return { ...createEmptyConversationState(), conversations };
}

function conversation(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
  return {
    channel: "telegram",
    clientSince: "2026-07-01",
    device: "mobile",
    entry: "inbound",
    id: "conversation-1",
    initials: "CT",
    language: "ru",
    messages: [],
    name: "Contract Test",
    operatorId: "operator-1",
    operatorName: "Operator One",
    phone: "+70000000000",
    preview: "Test",
    previous: [],
    queueId: "queue-support",
    sla: "00:10",
    slaTone: "ok",
    status: "assigned",
    tags: [],
    tenantId: "tenant-a",
    time: "now",
    topic: "Support",
    ...overrides
  };
}
