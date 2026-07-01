import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapApiConversation,
  mapApiConversationCollection
} from "../src/app/conversationApiMapper.js";

describe("conversationApiMapper", () => {
  it("maps a dialog API item to UI conversation shape", () => {
    const apiItem = {
      id: "conv-42",
      name: "Test User",
      channel: "Telegram",
      phone: "+7 900 111-22-33",
      status: "waiting_operator",
      preview: "Need help with payment",
      topic: "Оплата / Возврат",
      sla: "Waiting",
      slaTone: "hold",
      time: "now",
      tags: ["важно"],
      previous: [["2026-06-30", "Issue", "Closed"]],
      messages: [
        { id: "m-1", side: "client", text: "Hello", time: "10:00" },
        { id: "m-2", type: "event", text: "Assigned", time: "now" }
      ]
    };

    const mapped = mapApiConversation(apiItem);

    assert.deepEqual(mapped, {
      id: "conv-42",
      name: "Test User",
      initials: "TU",
      avatar: "",
      channel: "Telegram",
      phone: "+7 900 111-22-33",
      time: "сейчас",
      preview: "Need help with payment",
      status: "waiting_operator",
      sla: "Waiting",
      slaTone: "hold",
      topic: "Оплата / Возврат",
      unread: false,
      device: "Unknown",
      entry: "Telegram",
      language: "Русский",
      clientSince: "Новый контакт",
      tags: ["важно"],
      previous: [["2026-06-30", "Issue", "Closed"]],
      messages: [
        { id: "m-1", side: "client", text: "Hello", time: "10:00" },
        { id: "m-2", type: "event", text: "Assigned", time: "сейчас" }
      ]
    });
  });

  it("maps envelope collection into UI items", () => {
    const mapped = mapApiConversationCollection({
      items: [
        {
          id: "conv-a",
          name: "Alice",
          channel: "SDK",
          status: "active",
          messages: []
        }
      ]
    });

    assert.equal(mapped.length, 1);
    assert.equal(mapped[0].id, "conv-a");
    assert.equal(mapped[0].channel, "SDK");
    assert.equal(mapped[0].entry, "SDK");
    assert.equal(mapped[0].status, "active");
  });
});
