import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildClientDialogHistory,
  clientHistoryDefaultFilters,
  collectClientHistoryChannels,
  filterClientDialogHistory,
  mergeClientConversations,
  paginateClientDialogHistory
} from "../src/features/dialogs/clientDialogHistoryModel.js";

function conversationFixture(overrides = {}) {
  return {
    id: "conv-current",
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

describe("client dialog history model", () => {
  it("builds history from same-client conversations and marks the current one first", () => {
    const current = conversationFixture();
    const closedSibling = conversationFixture({
      id: "conv-closed",
      status: "closed",
      topic: "Возврат",
      preview: "Возврат оформлен",
      metadata: { closedAt: "2026-07-01T10:00:00.000Z" },
      messages: [{ id: 1, side: "client", text: "Хочу вернуть товар", time: "10:00" }]
    });
    const otherClient = conversationFixture({ id: "conv-other", phone: "+7 911 000-00-00" });

    const entries = buildClientDialogHistory({
      conversation: current,
      conversations: [otherClient, closedSibling, current]
    });

    assert.equal(entries.length, 2);
    assert.equal(entries[0].conversationId, "conv-current");
    assert.equal(entries[0].isCurrent, true);
    assert.equal(entries[1].conversationId, "conv-closed");
    assert.equal(entries[1].isClosed, true);
    assert.equal(entries[1].statusLabel, "Закрыто");
    assert.equal(entries[1].dateLabel, "01.07.2026");
  });

  it("labels dialogs with the appeal start date, not the time-of-day", () => {
    const current = conversationFixture();
    const openSibling = conversationFixture({
      id: "conv-open",
      status: "active",
      topic: "Оплата",
      time: "12:40",
      updatedAt: "2026-07-14T08:15:00.000Z",
      messages: [{ id: 1, side: "client", text: "Вопрос", time: "09:00", createdAt: "2026-07-10T09:00:00.000Z" }]
    });

    const entries = buildClientDialogHistory({ conversation: current, conversations: [openSibling] });
    const openEntry = entries.find((entry) => entry.conversationId === "conv-open");

    assert.equal(openEntry.isClosed, false);
    assert.equal(openEntry.dateLabel, "10.07.2026");
  });

  it("labels a closed dialog with its start date so the list matches the appeal it opens", () => {
    const current = conversationFixture();
    // Обращение прошло 10.07, но закрыто позже (15.07) — в списке должна стоять
    // дата обращения, а не дата закрытия, иначе клик уводит на «другую» дату.
    const closedSibling = conversationFixture({
      id: "conv-closed",
      status: "closed",
      topic: "Товар / Несоответствие",
      metadata: { closedAt: "2026-07-15T12:00:00.000Z" },
      messages: [{ id: 1, side: "client", text: "Брак", time: "16:56", createdAt: "2026-07-10T16:56:00.000Z" }]
    });

    const entries = buildClientDialogHistory({ conversation: current, conversations: [closedSibling] });
    const closedEntry = entries.find((entry) => entry.conversationId === "conv-closed");

    assert.equal(closedEntry.isClosed, true);
    assert.equal(closedEntry.dateLabel, "10.07.2026");
  });

  it("keeps archive tuples, dedupes them across siblings and skips rows covered by real closed dialogs", () => {
    const closedSibling = conversationFixture({
      id: "conv-closed",
      status: "closed",
      topic: "Оплата",
      metadata: { closedAt: "2026-07-01T10:00:00.000Z" },
      previous: [["2024-05-05", "Возврат", "Closed"], ["2026-07-01", "Оплата", "Closed"]]
    });
    const current = conversationFixture({
      previous: [["2024-05-05", "Возврат", "Closed"], ["2026-07-01", "Оплата", "Closed"]]
    });

    const entries = buildClientDialogHistory({
      conversation: current,
      conversations: [closedSibling]
    });

    const archiveEntries = entries.filter((entry) => entry.kind === "archive");
    assert.equal(archiveEntries.length, 1);
    assert.equal(archiveEntries[0].title, "Возврат");
    assert.equal(archiveEntries[0].dateLabel, "05.05.2024");
    assert.equal(archiveEntries[0].isClosed, true);
    assert.equal(archiveEntries[0].statusLabel, "Закрыто");
  });

  it("returns nothing for the empty placeholder conversation", () => {
    assert.deepEqual(buildClientDialogHistory({ conversation: { id: "empty", previous: [] }, conversations: [] }), []);
  });

  it("keeps undated sibling conversations above dated archive rows", () => {
    const current = conversationFixture({ previous: [["2024-05-05", "Возврат", "Closed"]] });
    const undatedSibling = conversationFixture({ id: "conv-outbound", status: "queued", topic: "Исходящий", time: "сейчас" });

    const entries = buildClientDialogHistory({ conversation: current, conversations: [undatedSibling] });

    assert.deepEqual(entries.map((entry) => entry.key), [
      "conversation:conv-current",
      "conversation:conv-outbound",
      "archive:2024-05-05|Возврат|Closed"
    ]);
  });

  it("filters by query across topic and message texts, by status and by channel", () => {
    const current = conversationFixture({
      messages: [{ id: 1, side: "client", text: "Промокод SUMMER не работает", time: "12:00" }]
    });
    const closedSibling = conversationFixture({
      id: "conv-closed",
      status: "closed",
      topic: "Возврат",
      metadata: { closedAt: "2026-07-01T10:00:00.000Z" }
    });
    const entries = buildClientDialogHistory({ conversation: current, conversations: [closedSibling] });

    const byMessage = filterClientDialogHistory(entries, { ...clientHistoryDefaultFilters, query: "промокод" });
    assert.deepEqual(byMessage.map((entry) => entry.conversationId), ["conv-current"]);

    const closedOnly = filterClientDialogHistory(entries, { ...clientHistoryDefaultFilters, status: "closed" });
    assert.deepEqual(closedOnly.map((entry) => entry.conversationId), ["conv-closed"]);

    const openOnly = filterClientDialogHistory(entries, { ...clientHistoryDefaultFilters, status: "open" });
    assert.deepEqual(openOnly.map((entry) => entry.conversationId), ["conv-current"]);

    const sdkOnly = filterClientDialogHistory(entries, { ...clientHistoryDefaultFilters, channel: "sdk" });
    assert.equal(sdkOnly.length, 2);
    assert.equal(filterClientDialogHistory(entries, { ...clientHistoryDefaultFilters, channel: "Telegram" }).length, 0);
  });

  it("paginates with clamped page numbers", () => {
    const entries = Array.from({ length: 19 }, (_, index) => ({ key: `entry-${index}` }));

    const firstPage = paginateClientDialogHistory(entries, { page: 1, pageSize: 8 });
    assert.equal(firstPage.items.length, 8);
    assert.equal(firstPage.totalPages, 3);
    assert.equal(firstPage.total, 19);

    const lastPage = paginateClientDialogHistory(entries, { page: 99, pageSize: 8 });
    assert.equal(lastPage.page, 3);
    assert.equal(lastPage.items.length, 3);
    assert.equal(lastPage.items[0].key, "entry-16");

    const invalidPage = paginateClientDialogHistory(entries, { page: 0, pageSize: 8 });
    assert.equal(invalidPage.page, 1);
  });

  it("merges backend extras without duplicating already loaded conversations", () => {
    const local = [conversationFixture(), conversationFixture({ id: "conv-closed" })];
    const extras = [conversationFixture({ id: "conv-closed" }), conversationFixture({ id: "conv-archived", status: "closed" })];

    const merged = mergeClientConversations(local, extras);
    assert.deepEqual(merged.map((conversation) => conversation.id), ["conv-current", "conv-closed", "conv-archived"]);
  });

  it("collects unique channels for the filter control", () => {
    const channels = collectClientHistoryChannels([
      { channel: "SDK" },
      { channel: "sdk" },
      { channel: "Telegram" },
      { channel: "" }
    ]);
    assert.deepEqual(channels, ["SDK", "Telegram"]);
  });
});
