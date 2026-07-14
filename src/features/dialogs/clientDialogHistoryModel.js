import { resolveClientIdentityKey } from "../../app/clientProfileModel.js";
import { statusLabels } from "../../app/dialogModel.js";

export const CLIENT_HISTORY_PAGE_SIZE = 8;

export const clientHistoryStatusFilters = [
  { value: "all", label: "Все статусы" },
  { value: "open", label: "Открытые" },
  { value: "closed", label: "Закрытые" }
];

export const clientHistoryDefaultFilters = {
  channel: "all",
  page: 1,
  query: "",
  status: "all"
};

const ARCHIVE_PREVIEW_LABEL = "Архивная запись истории обращений";
const NO_TOPIC_LABEL = "Без тематики";
const closedStatusValues = new Set(["closed", "закрыт", "закрыто"]);

export function buildClientDialogHistory({ conversation, conversations = [] }) {
  if (!conversation || conversation.id === "empty") {
    return [];
  }

  const identityKey = resolveClientIdentityKey(conversation);
  const pool = [conversation, ...conversations.filter((item) => item && item.id !== conversation.id)];
  const siblings = pool.filter((item) => resolveClientIdentityKey(item) === identityKey);
  const conversationEntries = siblings.map((item) => toConversationEntry(item, conversation.id));

  const closedSignatures = new Set(
    conversationEntries
      .filter((entry) => entry.isClosed && entry.closedDateKey)
      .map((entry) => `${entry.closedDateKey}|${normalizeTopic(entry.topic)}`)
  );

  const archiveEntries = [];
  const seenTuples = new Set();
  for (const sibling of siblings) {
    for (const row of Array.isArray(sibling.previous) ? sibling.previous : []) {
      if (!Array.isArray(row) || !row.length) {
        continue;
      }

      const [date = "", topic = "", status = ""] = row.map((value) => String(value ?? "").trim());
      const tupleKey = `${date}|${topic}|${status}`;
      if (seenTuples.has(tupleKey)) {
        continue;
      }
      seenTuples.add(tupleKey);

      // Закрытие уже представлено реальной записью диалога — не дублируем строкой архива.
      if (isClosedStatusValue(status) && closedSignatures.has(`${date}|${normalizeTopic(topic)}`)) {
        continue;
      }

      archiveEntries.push(toArchiveEntry({ channel: conversation.channel, date, status, topic }));
    }
  }

  return [...conversationEntries, ...archiveEntries].sort(byHistoryOrder);
}

export function filterClientDialogHistory(entries, { channel = "all", query = "", status = "all" } = {}) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  const normalizedChannel = String(channel ?? "all").trim().toLowerCase();

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    if (status === "open" && entry.isClosed) {
      return false;
    }
    if (status === "closed" && !entry.isClosed) {
      return false;
    }
    if (normalizedChannel !== "all" && String(entry.channel ?? "").trim().toLowerCase() !== normalizedChannel) {
      return false;
    }
    return !normalizedQuery || entry.searchText.includes(normalizedQuery);
  });
}

export function paginateClientDialogHistory(entries, { page = 1, pageSize = CLIENT_HISTORY_PAGE_SIZE } = {}) {
  const items = Array.isArray(entries) ? entries : [];
  const size = Math.max(1, Math.trunc(Number(pageSize)) || CLIENT_HISTORY_PAGE_SIZE);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), totalPages);
  const start = (safePage - 1) * size;

  return {
    items: items.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages
  };
}

export function collectClientHistoryChannels(entries) {
  const channels = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const channel = String(entry?.channel ?? "").trim();
    if (channel && !channels.has(channel.toLowerCase())) {
      channels.set(channel.toLowerCase(), channel);
    }
  }
  return [...channels.values()];
}

export function mergeClientConversations(primary = [], extras = []) {
  const knownIds = new Set(primary.map((conversation) => conversation?.id));
  return [...primary, ...extras.filter((conversation) => conversation && !knownIds.has(conversation.id))];
}

function toConversationEntry(conversation, currentConversationId) {
  const status = String(conversation.status ?? "").trim();
  const isClosed = isClosedStatusValue(status);
  const closedAt = String(conversation.metadata?.closedAt ?? "").trim();
  const updatedAt = String(conversation.updatedAt ?? "").trim();
  const sortSource = closedAt || updatedAt;
  const timestamp = Date.parse(sortSource);
  const closedDateKey = (closedAt || (isClosed ? updatedAt : "")).slice(0, 10);
  const topic = String(conversation.topic ?? "").trim();
  const preview = String(conversation.preview ?? "").trim();
  const title = topic || preview || NO_TOPIC_LABEL;
  const statusLabel = statusLabels[status] ?? (status || "—");
  const dateLabel = isClosed && closedDateKey
    ? formatHistoryDate(closedDateKey)
    : String(conversation.time ?? "").trim() || (sortSource ? formatHistoryDate(sortSource.slice(0, 10)) : "—");
  const messageTexts = (Array.isArray(conversation.messages) ? conversation.messages : [])
    .filter((message) => message && message.type !== "event")
    .map((message) => String(message.text ?? ""));

  return {
    channel: String(conversation.channel ?? "").trim(),
    closedDateKey,
    conversation,
    conversationId: conversation.id,
    dateLabel,
    isClosed,
    isCurrent: conversation.id === currentConversationId,
    key: `conversation:${conversation.id}`,
    kind: "conversation",
    preview,
    searchText: buildSearchText([
      title,
      topic,
      preview,
      conversation.name,
      conversation.channel,
      statusLabel,
      dateLabel,
      ...messageTexts
    ]),
    statusLabel,
    // Диалог без метки времени считается недавним: он должен стоять выше
    // датированных архивных строк, а не проваливаться в конец списка.
    timestamp: Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER,
    title,
    topic
  };
}

function toArchiveEntry({ channel, date, status, topic }) {
  const isClosed = isClosedStatusValue(status);
  const statusLabel = isClosed ? statusLabels.closed : (status || "—");
  const dateLabel = formatHistoryDate(date);
  const title = topic || NO_TOPIC_LABEL;
  const timestamp = Date.parse(date.length <= 10 ? `${date}T00:00:00` : date);

  return {
    channel: String(channel ?? "").trim(),
    closedDateKey: date.slice(0, 10),
    conversation: null,
    conversationId: "",
    dateLabel,
    isClosed,
    isCurrent: false,
    key: `archive:${date}|${topic}|${status}`,
    kind: "archive",
    preview: ARCHIVE_PREVIEW_LABEL,
    searchText: buildSearchText([title, topic, statusLabel, dateLabel, ARCHIVE_PREVIEW_LABEL]),
    statusLabel,
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    title,
    topic
  };
}

function byHistoryOrder(left, right) {
  if (left.isCurrent !== right.isCurrent) {
    return left.isCurrent ? -1 : 1;
  }
  return right.timestamp - left.timestamp;
}

function buildSearchText(parts) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function normalizeTopic(topic) {
  return String(topic ?? "").trim().toLowerCase();
}

function isClosedStatusValue(status) {
  return closedStatusValues.has(String(status ?? "").trim().toLowerCase());
}

function formatHistoryDate(value) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return normalized || "—";
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}
