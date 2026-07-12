import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import {
  detectRepeatAppeal,
  REPEAT_APPEAL_TAG,
  resolveOrForkAppealConversation
} from "../apps/api-gateway/src/conversation/appeal-lifecycle.ts";
import { ConversationRepository as RuntimeConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { IdentityRepository as RuntimeIdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";
import type { ConversationRecord } from "../apps/api-gateway/src/conversation/conversation.types.ts";
import type { AppealConversationMutation } from "../apps/api-gateway/src/conversation/appeal-lifecycle.ts";

const ConversationRepository = {
  inMemory: () => RuntimeConversationRepository.inMemory(bootstrapConversationState())
};

function appealMutation(conversation: ConversationRecord, eventType: AppealConversationMutation["lifecycleEvent"]["eventType"] = "conversation.created"): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  return {
    conversation,
    lifecycleEvent: {
      actorId: null,
      actorName: null,
      actorType: "client",
      conversationId: conversation.id,
      data: {},
      eventType,
      id: `lifecycle_${randomUUID()}`,
      ingestedAt: occurredAt,
      occurredAt,
      reason: null,
      schemaVersion: "conversation-lifecycle/v1",
      source: "test",
      sourceEventId: `rt_${randomUUID()}`,
      tenantId: conversation.tenantId,
      traceId: `trc_${randomUUID()}`
    },
    realtimeEvent: {
      data: {},
      eventId: `rt_${randomUUID()}`,
      eventName: eventType === "conversation.updated" ? "conversation.updated" : "conversation.created",
      occurredAt,
      resourceId: conversation.id,
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: conversation.tenantId,
      traceId: `trc_${randomUUID()}`
    }
  };
}

describe("appeal lifecycle contracts", () => {
  beforeEach(() => {
    RuntimeConversationRepository.useDefault(RuntimeConversationRepository.inMemory(bootstrapConversationState()));
  });

  it("creates a new appeal when a client message arrives after the previous appeal was closed", async () => {
    const repository = ConversationRepository.inMemory();
    const identityRepository = RuntimeIdentityRepository.inMemory(bootstrapIdentityState());
    const conversations = new ConversationService(repository, { identityRepository });
    const anchorId = "appeal-test-anchor";

    await repository.saveConversationMutation(appealMutation({
      channel: "Telegram",
      clientSince: "2026-07-12",
      device: "Telegram",
      entry: "Telegram",
      id: anchorId,
      initials: "AT",
      language: "Unknown",
      messages: [],
      name: "Appeal Test",
      phone: "10001",
      preview: "",
      previous: [],
      sla: "Closed",
      slaTone: "muted",
      status: "closed",
      tags: ["telegram", `appeal-anchor:${anchorId}`],
      tenantId: "tenant-volga",
      time: "now",
      topic: "Billing",
      metadata: { anchorId, closedAt: "2026-07-12T10:00:00.000Z" }
    }));

    const forked = await resolveOrForkAppealConversation({
      anchorId,
      conversationRepository: repository,
      createInitial: () => ({
        channel: "Telegram",
        clientSince: "2026-07-12",
        device: "Telegram",
        entry: "Telegram",
        id: anchorId,
        initials: "AT",
        language: "Unknown",
        messages: [],
        name: "Appeal Test",
        phone: "10001",
        preview: "",
        previous: [],
        sla: "Active",
        slaTone: "ok",
        status: "active",
        tags: ["telegram"],
        tenantId: "tenant-volga",
        time: "now",
        topic: "Telegram / Bot"
      }),
      createMutation: appealMutation,
      tenantId: "tenant-volga"
    });

    assert.ok(forked);
    assert.equal(forked.forked, true);
    assert.notEqual(forked.conversation.id, anchorId);
    assert.equal(forked.conversation.status, "new");

    const inbound = await conversations.normalizeInboundEvent("telegram", {
      conversationId: forked.conversation.id,
      eventId: "appeal-fork-inbound-1",
      text: "Клиент написал снова"
    });
    assert.equal(inbound.status, "ok");

    const assigned = await conversations.assignConversation({
      conversationId: forked.conversation.id,
      operatorId: "usr-volga-admin",
      reason: "Queue assignment after repeat inbound"
    }, { tenantId: "tenant-volga" });
    assert.equal(assigned.status, "ok");
  });

  it("marks a follow-up appeal as repeat when topic matches the previous close within 24 hours", async () => {
    const anchorId = "tg_repeat_anchor";
    const closedParent: ConversationRecord = {
      channel: "Telegram",
      clientSince: "2026-07-12",
      device: "Telegram",
      entry: "Telegram",
      id: anchorId,
      initials: "RP",
      language: "Unknown",
      messages: [],
      name: "Repeat Parent",
      phone: "10002",
      preview: "",
      previous: [
        ["2026-07-12", "Billing", "Closed"],
        ["2026-07-12", "Billing", "Closed"]
      ],
      sla: "Closed",
      slaTone: "muted",
      status: "closed",
      tags: ["telegram", `appeal-anchor:${anchorId}`],
      tenantId: "tenant-volga",
      time: "now",
      topic: "Billing",
      metadata: { anchorId, closedAt: "2026-07-12T08:00:00.000Z" }
    };

    assert.equal(detectRepeatAppeal(closedParent), true);

    const repository = ConversationRepository.inMemory();
    await repository.saveConversationMutation(appealMutation(closedParent));

    const forked = await resolveOrForkAppealConversation({
      anchorId,
      conversationRepository: repository,
      createInitial: () => closedParent,
      createMutation: appealMutation,
      tenantId: "tenant-volga"
    });

    assert.ok(forked);
    assert.equal(forked.isRepeatAppeal, true);
    assert.equal(forked.conversation.tags.includes(REPEAT_APPEAL_TAG), true);
    assert.equal(forked.conversation.metadata?.isRepeatAppeal, true);
  });

  it("records closed appeal history when an operator closes a dialog", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);

    const closed = await conversations.transitionConversationStatus({
      conversationId: "maria",
      nextStatus: "closed",
      resolutionOutcome: "resolved",
      topic: "Delivery"
    }, {
      actorId: "usr-volga-admin",
      actorName: "Sergey Markin",
      actorType: "operator",
      tenantId: "tenant-volga"
    });

    assert.equal(closed.status, "ok");
    const detail = await conversations.fetchDialogDetail("maria", { tenantId: "tenant-volga" });
    assert.equal(detail.data.conversation.status, "closed");
    assert.ok(detail.data.conversation.previous.some((row) => row[1] === "Delivery" && row[2] === "Closed"));
    assert.ok(detail.data.conversation.metadata?.closedAt);
  });

  it("does not mark a follow-up appeal as repeat when the topic changed", () => {
    const closedParent: ConversationRecord = {
      channel: "Telegram",
      clientSince: "2026-07-12",
      device: "Telegram",
      entry: "Telegram",
      id: "tg_non_repeat",
      initials: "NR",
      language: "Unknown",
      messages: [],
      name: "Non Repeat",
      phone: "10003",
      preview: "",
      previous: [
        ["2026-07-12", "Billing", "Closed"],
        ["2026-07-12", "Delivery", "Closed"]
      ],
      sla: "Closed",
      slaTone: "muted",
      status: "closed",
      tags: ["telegram"],
      tenantId: "tenant-volga",
      time: "now",
      topic: "Delivery",
      metadata: { closedAt: "2026-07-12T08:00:00.000Z" }
    };

    assert.equal(detectRepeatAppeal(closedParent), false);
  });
});
