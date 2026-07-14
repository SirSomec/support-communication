import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientThreadTimeline,
  findThreadByConversationId,
  groupConversationsIntoClientThreads,
  resolveDefaultReplyChannel,
  resolveThreadChannelOptions,
  resolveThreadSendTarget
} from "../src/features/dialogs/clientThreadModel.js";

function appealFixture(overrides = {}) {
  return {
    id: "appeal-current",
    name: "Мария К.",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    status: "active",
    topic: "Доставка / Статус",
    preview: "Где мой заказ?",
    time: "12:40",
    tags: [],
    previous: [],
    messages: [],
    ...overrides
  };
}

describe("client thread model", () => {
  it("groups appeals of the same client across channels into one thread", () => {
    const sdkAppeal = appealFixture({
      id: "appeal-sdk",
      updatedAt: "2026-07-10T10:00:00.000Z",
      messages: [{ id: 1, side: "client", text: "Где мой заказ?", createdAt: "2026-07-10T10:00:00.000Z", time: "10:00" }]
    });
    const telegramAppeal = appealFixture({
      id: "appeal-telegram",
      channel: "Telegram",
      status: "closed",
      metadata: { closedAt: "2026-07-01T10:00:00.000Z" },
      updatedAt: "2026-07-01T10:00:00.000Z",
      messages: [{ id: 1, side: "client", text: "Вопрос по оплате", createdAt: "2026-07-01T09:00:00.000Z", time: "09:00" }]
    });
    const otherClient = appealFixture({ id: "appeal-other", phone: "+7 911 000-00-00" });

    const threads = groupConversationsIntoClientThreads([telegramAppeal, sdkAppeal, otherClient]);

    assert.equal(threads.length, 2);
    const thread = findThreadByConversationId(threads, "appeal-telegram");
    assert.equal(thread.id, "appeal-sdk");
    assert.equal(thread.appealCount, 2);
    assert.deepEqual(thread.conversationIds, ["appeal-telegram", "appeal-sdk"]);
    assert.deepEqual(thread.channels, ["SDK", "Telegram"]);
    assert.equal(thread.preview, "Где мой заказ?");
  });

  it("keeps clients with different phones in separate threads", () => {
    const first = appealFixture({ id: "a1" });
    const second = appealFixture({ id: "a2", phone: "+7 911 000-00-00" });

    const threads = groupConversationsIntoClientThreads([first, second]);

    assert.equal(threads.length, 2);
    assert.equal(threads[0].appealCount, 1);
  });

  it("does not inherit repeat-appeal and anchor tags from older appeals", () => {
    const oldAppeal = appealFixture({
      id: "appeal-old",
      status: "closed",
      updatedAt: "2026-07-01T10:00:00.000Z",
      tags: ["repeat-appeal", "appeal-anchor:anchor-1", "жалоба"]
    });
    const currentAppeal = appealFixture({
      id: "appeal-new",
      updatedAt: "2026-07-10T10:00:00.000Z",
      tags: ["доставка"]
    });

    const [thread] = groupConversationsIntoClientThreads([oldAppeal, currentAppeal]);

    assert.equal(thread.id, "appeal-new");
    assert.deepEqual(thread.tags, ["доставка", "жалоба"]);
  });

  it("builds a unified timeline with appeal separators and message channels", () => {
    const closedAppeal = appealFixture({
      id: "appeal-closed",
      channel: "Telegram",
      status: "closed",
      topic: "Оплата",
      metadata: { closedAt: "2026-07-01T10:00:00.000Z" },
      updatedAt: "2026-07-01T10:00:00.000Z",
      messages: [
        { id: 1, side: "client", text: "Не проходит оплата", createdAt: "2026-07-01T09:00:00.000Z", time: "09:00" },
        { id: 2, side: "agent", text: "Проверяю", createdAt: "2026-07-01T09:05:00.000Z", time: "09:05" }
      ]
    });
    const currentAppeal = appealFixture({
      id: "appeal-current",
      updatedAt: "2026-07-10T10:00:00.000Z",
      messages: [
        { id: 1, side: "client", text: "Где мой заказ?", createdAt: "2026-07-10T10:00:00.000Z", time: "10:00" },
        { id: 2, type: "internal", text: "Проверить курьера", createdAt: "2026-07-10T10:01:00.000Z", time: "10:01" }
      ]
    });
    const [thread] = groupConversationsIntoClientThreads([currentAppeal, closedAppeal]);

    const timeline = buildClientThreadTimeline(thread, { topics: {}, transcriptMode: "all" });

    const separators = timeline.filter((item) => item.kind === "appeal");
    assert.equal(separators.length, 2);
    assert.deepEqual(separators.map((item) => item.conversationId), ["appeal-closed", "appeal-current"]);
    assert.equal(separators[0].statusLabel, "Закрыто");
    assert.equal(separators[0].dateLabel, "01.07.2026");
    assert.equal(separators[1].isCurrent, true);

    const messages = timeline.filter((item) => item.kind === "message");
    // Внутренний комментарий скрыт в режиме "all", каналы наследуются от обращения.
    assert.equal(messages.length, 3);
    assert.equal(messages[0].message.channel, "Telegram");
    assert.equal(messages[2].message.channel, "SDK");
  });

  it("filters unified timeline by transcript mode and applies topic overrides", () => {
    const appeal = appealFixture({
      messages: [
        { id: 1, side: "client", text: "Вопрос", time: "10:00" },
        { id: 2, type: "internal", text: "Заметка", time: "10:01" },
        { id: 3, type: "event", text: "Событие", time: "10:02" }
      ]
    });
    const [thread] = groupConversationsIntoClientThreads([appeal]);

    const internalTimeline = buildClientThreadTimeline(thread, { transcriptMode: "internal" });
    assert.deepEqual(
      internalTimeline.filter((item) => item.kind === "message").map((item) => item.message.id),
      [2]
    );

    const overridden = buildClientThreadTimeline(thread, { topics: { [appeal.id]: "Новая тема" } });
    assert.equal(overridden.find((item) => item.kind === "appeal").topic, "Новая тема");
  });

  it("resolves channel options preferring open appeals per channel", () => {
    const closedTelegram = appealFixture({
      id: "tg-closed",
      channel: "Telegram",
      status: "closed",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const openTelegram = appealFixture({
      id: "tg-open",
      channel: "Telegram",
      status: "waiting_operator",
      updatedAt: "2026-07-08T10:00:00.000Z"
    });
    const openSdk = appealFixture({ id: "sdk-open", updatedAt: "2026-07-10T10:00:00.000Z" });
    const [thread] = groupConversationsIntoClientThreads([closedTelegram, openTelegram, openSdk]);

    const options = resolveThreadChannelOptions(thread);

    assert.deepEqual(
      options.map((option) => [option.channel, option.conversationId, option.isClosed]),
      [["SDK", "sdk-open", false], ["Telegram", "tg-open", false]]
    );
  });

  it("marks channels whose only appeal is closed and routes send targets by channel", () => {
    const closedTelegram = appealFixture({
      id: "tg-closed",
      channel: "Telegram",
      status: "closed",
      updatedAt: "2026-07-01T10:00:00.000Z"
    });
    const openSdk = appealFixture({ id: "sdk-open", updatedAt: "2026-07-10T10:00:00.000Z" });
    const [thread] = groupConversationsIntoClientThreads([closedTelegram, openSdk]);

    const options = resolveThreadChannelOptions(thread);
    assert.deepEqual(
      options.map((option) => [option.channel, option.isClosed]),
      [["SDK", false], ["Telegram", true]]
    );

    assert.equal(resolveThreadSendTarget(thread, "Telegram"), "tg-closed");
    assert.equal(resolveThreadSendTarget(thread, "SDK"), "sdk-open");
    assert.equal(resolveThreadSendTarget(thread, "MAX"), thread.id);
    assert.equal(resolveThreadSendTarget(thread, ""), thread.id);
  });

  it("defaults the reply channel to the channel of the latest client message", () => {
    const telegramAppeal = appealFixture({
      id: "tg",
      channel: "Telegram",
      status: "closed",
      updatedAt: "2026-07-09T10:00:00.000Z",
      messages: [{ id: 1, side: "client", text: "Из Telegram", createdAt: "2026-07-09T10:00:00.000Z", time: "10:00" }]
    });
    const sdkAppeal = appealFixture({
      id: "sdk",
      updatedAt: "2026-07-10T10:00:00.000Z",
      messages: [
        { id: 1, side: "client", text: "Из SDK", createdAt: "2026-07-08T10:00:00.000Z", time: "10:00" },
        { id: 2, side: "agent", text: "Ответ", createdAt: "2026-07-10T11:00:00.000Z", time: "11:00" }
      ]
    });
    const [thread] = groupConversationsIntoClientThreads([telegramAppeal, sdkAppeal]);

    assert.equal(resolveDefaultReplyChannel(thread), "Telegram");
  });

  it("falls back to the primary appeal channel when client messages carry no timestamps", () => {
    const appeal = appealFixture({
      messages: [{ id: 1, side: "agent", text: "Исходящее", time: "10:00" }]
    });
    const [thread] = groupConversationsIntoClientThreads([appeal]);

    assert.equal(resolveDefaultReplyChannel(thread), "SDK");
  });

  it("treats a plain conversation without thread fields as a single-appeal thread", () => {
    const conversation = appealFixture({ messages: [{ id: 1, side: "client", text: "Привет", time: "10:00" }] });

    const timeline = buildClientThreadTimeline(conversation, {});
    assert.equal(timeline.filter((item) => item.kind === "appeal").length, 1);
    assert.equal(resolveThreadSendTarget(conversation, "SDK"), conversation.id);
    assert.deepEqual(
      resolveThreadChannelOptions(conversation).map((option) => option.channel),
      ["SDK"]
    );
  });
});
