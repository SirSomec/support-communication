import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTagSuggestions,
  getVisibleTags,
  isServiceTag,
  normalizeTagInput,
  TAG_LIMIT_PER_DIALOG,
  validateTagInput
} from "../src/features/dialogs/tagSuggestionModel.js";

function conversationFixture(overrides = {}) {
  return {
    id: "appeal-current",
    name: "Мария К.",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    status: "active",
    slaTone: "ok",
    topic: "",
    preview: "",
    tags: [],
    messages: [],
    ...overrides
  };
}

describe("tag suggestion model", () => {
  it("hides service tags from the visible list and deduplicates the rest", () => {
    const conversation = conversationFixture({
      tags: ["доставка", "repeat-appeal", "appeal-anchor:thread-1", "Доставка", "важно"]
    });

    assert.deepEqual(getVisibleTags(conversation), ["доставка", "важно"]);
    assert.equal(isServiceTag("repeat-appeal"), true);
    assert.equal(isServiceTag("appeal-anchor:thread-1"), true);
    assert.equal(isServiceTag("доставка"), false);
  });

  it("normalizes tag input to lowercase with collapsed whitespace", () => {
    assert.equal(normalizeTagInput("  Возврат   Средств "), "возврат средств");
  });

  it("validates operator tag input", () => {
    assert.deepEqual(validateTagInput(" Возврат ", []), { ok: true, tag: "возврат" });
    assert.equal(validateTagInput("x", []).ok, false);
    assert.equal(validateTagInput("а".repeat(33), []).ok, false);
    assert.equal(validateTagInput("repeat-appeal", []).ok, false);
    assert.equal(validateTagInput("ВАЖНО", ["важно"]).ok, false);
    const full = Array.from({ length: TAG_LIMIT_PER_DIALOG }, (_, index) => `тег-${index}`);
    assert.equal(validateTagInput("еще один", full).ok, false);
  });

  it("suggests situation tags for repeat appeals, rescue and sla risk first", () => {
    const conversation = conversationFixture({
      tags: ["repeat-appeal"],
      rescue: { state: "active" },
      slaTone: "danger"
    });

    const suggestions = buildTagSuggestions({ conversation });
    const tags = suggestions.map((item) => item.tag);

    assert.deepEqual(tags.slice(0, 3), ["повторное обращение", "спасение", "важно"]);
    assert.ok(suggestions.every((item) => item.hint));
  });

  it("suggests content tags from the topic and client messages of the whole thread", () => {
    const conversation = conversationFixture({
      topic: "Оплата / Возврат",
      appeals: [
        conversationFixture({
          id: "appeal-old",
          messages: [
            { id: 1, side: "client", text: "Когда вернут деньги за отмененный заказ?" },
            { id: 2, side: "agent", text: "Проверяю жалобу и промокод." }
          ]
        }),
        conversationFixture({ id: "appeal-current", messages: [{ id: 1, side: "client", text: "Курьер так и не приехал" }] })
      ]
    });

    const tags = buildTagSuggestions({ conversation, limit: 20 }).map((item) => item.tag);

    assert.ok(tags.includes("оплата"), `expected payment tag in ${tags}`);
    assert.ok(tags.includes("возврат"));
    assert.ok(tags.includes("доставка"));
    assert.ok(tags.includes("отмена"));
    assert.ok(!tags.includes("жалоба"), "agent-side text must not produce suggestions");
  });

  it("excludes already added tags case-insensitively and respects the limit", () => {
    const conversation = conversationFixture({
      topic: "Доставка",
      tags: ["ДОСТАВКА"],
      slaTone: "warn"
    });

    const suggestions = buildTagSuggestions({ conversation, limit: 1 });

    assert.equal(suggestions.length, 1);
    assert.deepEqual(suggestions.map((item) => item.tag), ["важно"]);
  });

  it("suggests thread channels and popular tags from other dialogs", () => {
    const conversation = conversationFixture({ channels: ["SDK", "Telegram"] });
    const conversations = [
      conversationFixture({ id: "other-1", phone: "+7 911 000-00-01", tags: ["возврат", "важно"] }),
      conversationFixture({ id: "other-2", phone: "+7 911 000-00-02", tags: ["возврат"] }),
      conversationFixture({ id: "other-3", phone: "+7 911 000-00-03", tags: ["промокод"] }),
      conversationFixture({ id: "appeal-current", tags: ["игнорируется"] })
    ];

    const suggestions = buildTagSuggestions({ conversation, conversations, limit: 20 });
    const byTag = new Map(suggestions.map((item) => [item.tag, item]));

    assert.equal(byTag.get("sdk")?.source, "channel");
    assert.equal(byTag.get("telegram")?.source, "channel");
    assert.equal(byTag.get("возврат")?.source, "popular");
    assert.match(byTag.get("возврат")?.hint ?? "", /диалогов: 2/);
    assert.ok(!byTag.has("промокод"), "single-use tags are not popular");
    assert.ok(!byTag.has("игнорируется"), "own thread appeals are excluded from popularity");
  });

  it("marks bot handoff and reopened dialogs", () => {
    const conversation = conversationFixture({
      status: "reopened",
      botHandoff: { scenarioName: "Delivery status" }
    });

    const tags = buildTagSuggestions({ conversation }).map((item) => item.tag);

    assert.ok(tags.includes("передано ботом"));
    assert.ok(tags.includes("переоткрыт"));
  });
});
