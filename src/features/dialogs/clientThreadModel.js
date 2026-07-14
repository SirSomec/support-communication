import { resolveClientThreadKey } from "../../app/clientProfileModel.js";
import { REPEAT_APPEAL_TAG, statusLabels } from "../../app/dialogModel.js";
import { getVisibleMessages } from "./timelineModel.js";

const APPEAL_ANCHOR_TAG_PREFIX = "appeal-anchor:";
const OPEN_STATUS_SCORE = 1e15;

// Диалог с клиентом один: все обращения (appeals) с одним телефоном —
// в том числе из разных каналов — собираются в один тред. Лицом треда
// (строка списка, заголовок чата, цели действий) служит актуальное обращение.
export function groupConversationsIntoClientThreads(conversations) {
  const items = Array.isArray(conversations) ? conversations : [];
  const groups = new Map();

  for (const conversation of items) {
    if (!conversation) {
      continue;
    }
    const key = resolveClientThreadKey(conversation);
    const bucket = groups.get(key) ?? [];
    bucket.push(conversation);
    groups.set(key, bucket);
  }

  return [...groups.values()].map((appeals) => buildThread(appeals));
}

export function findThreadByConversationId(threads, conversationId) {
  if (!conversationId) {
    return undefined;
  }
  return (Array.isArray(threads) ? threads : []).find((thread) =>
    thread.id === conversationId || (thread.conversationIds ?? []).includes(conversationId)
  );
}

export function threadAppeals(threadOrConversation) {
  const appeals = threadOrConversation?.appeals;
  if (Array.isArray(appeals) && appeals.length) {
    return appeals;
  }
  return threadOrConversation ? [threadOrConversation] : [];
}

// Единая лента окна чата: обращения идут блоками в хронологическом порядке,
// каждый блок открывается разделителем с метаданными обращения.
export function buildClientThreadTimeline(threadOrConversation, { topics = {}, transcriptMode = "all" } = {}) {
  const appeals = threadAppeals(threadOrConversation);
  const currentId = threadOrConversation?.id;
  const items = [];

  appeals.forEach((appeal, index) => {
    const status = String(appeal.status ?? "").trim();
    const isClosed = status === "closed";
    items.push({
      kind: "appeal",
      key: `appeal:${appeal.id}`,
      conversationId: appeal.id,
      index: index + 1,
      total: appeals.length,
      channel: String(appeal.channel ?? "").trim(),
      topic: String(topics[appeal.id] ?? appeal.topic ?? "").trim(),
      status,
      statusLabel: statusLabels[status] ?? (status || "—"),
      isClosed,
      isCurrent: appeal.id === currentId,
      dateLabel: appealDateLabel(appeal)
    });

    for (const message of getVisibleMessages(appeal.messages, transcriptMode)) {
      items.push({
        kind: "message",
        key: `message:${appeal.id}:${message.id}`,
        conversationId: appeal.id,
        message: message.channel ? message : { ...message, channel: String(appeal.channel ?? "").trim() }
      });
    }
  });

  return items;
}

// Каналы, в которые оператор может писать клиенту: по одному варианту на канал,
// целью служит последнее открытое обращение канала (иначе последнее закрытое).
export function resolveThreadChannelOptions(threadOrConversation) {
  const appeals = threadAppeals(threadOrConversation);
  const byChannel = new Map();

  for (const appeal of appeals) {
    const channel = String(appeal.channel ?? "").trim();
    if (!channel) {
      continue;
    }
    const existing = byChannel.get(channel);
    if (!existing || appealTargetScore(appeal) >= appealTargetScore(existing)) {
      byChannel.set(channel, appeal);
    }
  }

  return [...byChannel.entries()]
    .map(([channel, appeal]) => ({
      channel,
      conversationId: appeal.id,
      isClosed: String(appeal.status ?? "") === "closed"
    }))
    .sort((left, right) => {
      if (left.isClosed !== right.isClosed) {
        return left.isClosed ? 1 : -1;
      }
      return left.channel.localeCompare(right.channel, "ru");
    });
}

// Канал по умолчанию — тот, из которого клиент писал последним;
// если определить нельзя, канал актуального обращения.
export function resolveDefaultReplyChannel(threadOrConversation) {
  const appeals = threadAppeals(threadOrConversation);
  let latestChannel = "";
  let latestValue = -1;

  for (const appeal of appeals) {
    const messages = Array.isArray(appeal.messages) ? appeal.messages : [];
    for (const message of messages) {
      if (message?.side !== "client") {
        continue;
      }
      const value = Date.parse(String(message.createdAt ?? ""));
      const normalized = Number.isFinite(value) ? value : 0;
      if (normalized >= latestValue) {
        latestValue = normalized;
        latestChannel = String(message.channel ?? appeal.channel ?? "").trim();
      }
    }
  }

  if (latestChannel) {
    return latestChannel;
  }

  return String(threadOrConversation?.channel ?? "").trim();
}

export function resolveThreadSendTarget(threadOrConversation, channel) {
  const normalized = String(channel ?? "").trim();
  if (!normalized) {
    return threadOrConversation?.id;
  }

  const option = resolveThreadChannelOptions(threadOrConversation)
    .find((item) => item.channel.toLowerCase() === normalized.toLowerCase());
  return option?.conversationId ?? threadOrConversation?.id;
}

function buildThread(appeals) {
  const ordered = [...appeals].sort((left, right) => appealStartValue(left) - appealStartValue(right));
  const primary = pickPrimaryAppeal(ordered);
  const latest = pickLatestAppeal(ordered);
  const channels = collectThreadChannels(ordered);

  return {
    ...primary,
    appealCount: ordered.length,
    appeals: ordered,
    channels,
    conversationIds: ordered.map((appeal) => appeal.id),
    preview: latest.preview ?? primary.preview,
    tags: mergeThreadTags(primary, ordered),
    threadKey: resolveClientThreadKey(primary),
    time: latest.time ?? primary.time,
    unread: ordered.some((appeal) => Boolean(appeal.unread))
  };
}

function pickPrimaryAppeal(appeals) {
  return [...appeals].sort((left, right) => appealPriorityScore(right) - appealPriorityScore(left))[0];
}

function pickLatestAppeal(appeals) {
  return [...appeals].sort((left, right) => appealActivityValue(right) - appealActivityValue(left))[0];
}

function appealPriorityScore(appeal) {
  const statusScore = String(appeal?.status ?? "").toLowerCase() === "closed" ? 0 : OPEN_STATUS_SCORE;
  return statusScore + appealActivityValue(appeal);
}

function appealTargetScore(appeal) {
  return appealPriorityScore(appeal);
}

function appealActivityValue(appeal) {
  const messages = Array.isArray(appeal?.messages) ? appeal.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const value = Date.parse(String(messages[index]?.createdAt ?? ""));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  const updatedAt = Date.parse(String(appeal?.updatedAt ?? ""));
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const closedAt = Date.parse(String(appeal?.metadata?.closedAt ?? ""));
  return Number.isFinite(closedAt) ? closedAt : 0;
}

function appealStartValue(appeal) {
  const messages = Array.isArray(appeal?.messages) ? appeal.messages : [];
  for (const message of messages) {
    const value = Date.parse(String(message?.createdAt ?? ""));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return appealActivityValue(appeal);
}

function collectThreadChannels(appeals) {
  const seen = new Map();
  for (const appeal of [...appeals].sort((left, right) => appealActivityValue(right) - appealActivityValue(left))) {
    const channel = String(appeal.channel ?? "").trim();
    if (channel && !seen.has(channel.toLowerCase())) {
      seen.set(channel.toLowerCase(), channel);
    }
  }
  return [...seen.values()];
}

// Теги треда: теги актуального обращения плюс клиентские теги остальных.
// Служебные метки (повторное обращение, якорь appeal) чужих обращений
// не наследуются, чтобы не помечать тред навсегда.
function mergeThreadTags(primary, appeals) {
  const tags = [...(primary.tags ?? [])];
  const known = new Set(tags);

  for (const appeal of appeals) {
    if (appeal.id === primary.id) {
      continue;
    }
    for (const tag of appeal.tags ?? []) {
      const value = String(tag);
      if (value === REPEAT_APPEAL_TAG || value.startsWith(APPEAL_ANCHOR_TAG_PREFIX) || known.has(value)) {
        continue;
      }
      known.add(value);
      tags.push(value);
    }
  }

  return tags;
}

function appealDateLabel(appeal) {
  const started = firstParsableDate(appeal);
  if (started) {
    return `${pad(started.getDate())}.${pad(started.getMonth() + 1)}.${started.getFullYear()}`;
  }

  const time = String(appeal?.time ?? "").trim();
  return time || "—";
}

function firstParsableDate(appeal) {
  const messages = Array.isArray(appeal?.messages) ? appeal.messages : [];
  for (const message of messages) {
    const value = Date.parse(String(message?.createdAt ?? ""));
    if (Number.isFinite(value)) {
      return new Date(value);
    }
  }

  const closedAt = Date.parse(String(appeal?.metadata?.closedAt ?? ""));
  if (Number.isFinite(closedAt) && String(appeal?.status ?? "") === "closed") {
    return new Date(closedAt);
  }

  const updatedAt = Date.parse(String(appeal?.updatedAt ?? ""));
  return Number.isFinite(updatedAt) ? new Date(updatedAt) : null;
}

function pad(value) {
  return String(value).padStart(2, "0");
}
