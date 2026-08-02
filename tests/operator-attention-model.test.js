import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatFaviconBadgeCount, getAssignedConversationCount, isInboundAssignedMessageEvent } from "../src/app/operatorAttentionModel.js";

describe("operator attention model", () => {
  const conversations = [
    { id: "mine", operatorId: "operator-1", status: "active" },
    { id: "closed", operatorId: "operator-1", status: "closed" },
    { id: "other", operatorId: "operator-2", status: "waiting_operator" }
  ];

  it("counts only open appeals assigned to the current operator", () => {
    assert.equal(getAssignedConversationCount(conversations, "operator-1"), 1);
  });

  it("alerts only for inbound messages in an assigned appeal", () => {
    assert.equal(isInboundAssignedMessageEvent({ eventName: "message.created", resourceId: "mine", data: {} }, conversations, "operator-1"), true);
    assert.equal(isInboundAssignedMessageEvent({ eventName: "message.created", resourceId: "mine", data: { mode: "reply" } }, conversations, "operator-1"), false);
    assert.equal(isInboundAssignedMessageEvent({ eventName: "message.created", resourceId: "mine", data: { mode: "bot_reply" } }, conversations, "operator-1"), false);
    assert.equal(isInboundAssignedMessageEvent({ eventName: "message.created", resourceId: "other", data: {} }, conversations, "operator-1"), false);
  });

  it("keeps favicon labels legible", () => {
    assert.equal(formatFaviconBadgeCount(0), "0");
    assert.equal(formatFaviconBadgeCount(27), "27");
    assert.equal(formatFaviconBadgeCount(100), "99+");
  });
});
