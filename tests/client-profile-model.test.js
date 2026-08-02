import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupConversationsIntoClientProfiles } from "../src/app/clientProfileModel.js";

describe("client profile model", () => {
  it("combines client records from different channels by a normalized phone", () => {
    const profiles = groupConversationsIntoClientProfiles([
      {
        channel: "Telegram",
        id: "telegram-1",
        messages: [],
        phone: "+7 999 555-66-77",
        previous: [],
        status: "closed",
        tags: [],
        updatedAt: "2026-08-01T10:00:00.000Z"
      },
      {
        channel: "VK",
        id: "vk-1",
        messages: [],
        phone: "8 (999) 555-66-77",
        previous: [],
        status: "active",
        tags: [],
        updatedAt: "2026-08-02T10:00:00.000Z"
      }
    ]);

    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].appealCount, 2);
    assert.deepEqual(profiles[0].conversationIds.sort(), ["telegram-1", "vk-1"]);
  });
});
