import { createHash } from "node:crypto";
import { isAwaitingCsatFeedback } from "../quality/csat-feedback.js";
import type { ConversationLifecycleEvent, ConversationRepository, RealtimeEvent } from "./conversation.repository.js";
import type { ConversationRecord } from "./conversation.types.js";

export const APPEAL_ANCHOR_TAG_PREFIX = "appeal-anchor:";
export const REPEAT_APPEAL_TAG = "repeat-appeal";
export const REPEAT_APPEAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AppealLifecycleMetadata {
  anchorId?: string;
  closedAt?: string;
  isRepeatAppeal?: boolean;
  parentConversationId?: string;
}

export interface AppealConversationMutation {
  conversation: ConversationRecord;
  lifecycleEvent: ConversationLifecycleEvent;
  realtimeEvent: RealtimeEvent;
}

export interface ResolveAppealConversationInput {
  anchorId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  createInitial: () => ConversationRecord;
  createMutation: (conversation: ConversationRecord, eventType?: "conversation.created" | "conversation.updated") => AppealConversationMutation;
  /**
   * Живой адрес доставки из входящего события провайдера (tg chat id,
   * externalId и т.п.). Обязателен для fork-ветки: у закрытого appeal binding
   * уже снят releaseProviderBindingForClosedAppeal, наследовать нечего — без
   * этого поля новый тред падал в legacy-фолбэк на телефон и Telegram отвечал
   * 400 на каждую доставку (инцидент 2026-07-17).
   */
  providerConversationId?: string;
  /**
   * Перехват CSAT-отзыва: если последнее обращение закрыто и ждет комментарий
   * к оценке, входящее сообщение принадлежит ему (как отзыв), а не новому
   * обращению — fork не выполняется, а результат помечается флагом.
   */
  interceptCsatFeedback?: boolean;
  tenantId: string;
}

export interface ResolveAppealConversationResult {
  conversation: ConversationRecord;
  csatFeedbackAwaiting?: boolean;
  forked: boolean;
  isRepeatAppeal?: boolean;
}

export function appealAnchorTag(anchorId: string): string {
  return `${APPEAL_ANCHOR_TAG_PREFIX}${anchorId}`;
}

export function conversationMetadata(conversation: ConversationRecord): AppealLifecycleMetadata {
  const metadata = conversation.metadata;
  return metadata && typeof metadata === "object" ? { ...metadata } : {};
}

export function withConversationMetadata(
  conversation: ConversationRecord,
  patch: AppealLifecycleMetadata
): ConversationRecord {
  return {
    ...conversation,
    metadata: {
      ...conversationMetadata(conversation),
      ...patch
    }
  };
}

export function ensureAppealAnchorTag(conversation: ConversationRecord, anchorId: string): ConversationRecord {
  const tag = appealAnchorTag(anchorId);
  if (conversation.tags.includes(tag)) {
    return conversation;
  }

  return {
    ...conversation,
    tags: [...conversation.tags, tag],
    metadata: {
      ...conversationMetadata(conversation),
      anchorId
    }
  };
}

export function resolveClosedAt(conversation: ConversationRecord): Date | undefined {
  if (conversation.status !== "closed") {
    return undefined;
  }

  const metadata = conversationMetadata(conversation);
  const candidate = metadata.closedAt ?? conversation.updatedAt;
  if (!candidate) {
    return undefined;
  }

  const parsed = Date.parse(String(candidate));
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

export function detectRepeatAppeal(closedConversation: ConversationRecord): boolean {
  const closedAt = resolveClosedAt(closedConversation);
  const closingTopic = String(closedConversation.topic ?? "").trim();
  if (!closedAt || !closingTopic) {
    return false;
  }

  const closedEntries = findClosedHistoryEntries(closedConversation.previous);
  if (closedEntries.length < 2) {
    return false;
  }

  const previousClose = closedEntries[closedEntries.length - 2];
  const [, previousTopic] = previousClose;
  if (String(previousTopic ?? "").trim() !== closingTopic) {
    return false;
  }

  const previousClosedAt = parseAppealHistoryDate(previousClose[0]);
  if (!previousClosedAt) {
    return false;
  }

  return closedAt.getTime() - previousClosedAt.getTime() < REPEAT_APPEAL_WINDOW_MS;
}

export function recordClosedAppealHistory(conversation: ConversationRecord, closedAt: string): ConversationRecord {
  const historyRow: [string, string, string] = [
    closedAt.slice(0, 10),
    String(conversation.topic ?? "").trim() || "Без тематики",
    "Closed"
  ];

  return {
    ...conversation,
    previous: [...conversation.previous, historyRow],
    metadata: {
      ...conversationMetadata(conversation),
      closedAt
    },
    updatedAt: closedAt
  };
}

export function buildFollowUpAppeal(closedConversation: ConversationRecord, anchorId: string, providerConversationId?: string): ConversationRecord {
  const isRepeatAppeal = detectRepeatAppeal(closedConversation);
  const appealId = `${anchorId}_appeal_${createHash("sha256")
    .update(`${closedConversation.tenantId}:${closedConversation.id}:follow-up`)
    .digest("hex")
    .slice(0, 12)}`;
  const baseTags = closedConversation.tags.filter((tag) => tag !== REPEAT_APPEAL_TAG);
  const inheritedBinding = String(providerConversationId ?? "").trim() || closedConversation.providerConversationId;

  return ensureAppealAnchorTag({
    avatar: closedConversation.avatar,
    channel: closedConversation.channel,
    ...(closedConversation.channelConnectionId ? { channelConnectionId: closedConversation.channelConnectionId } : {}),
    clientSince: closedConversation.clientSince,
    device: closedConversation.device,
    entry: closedConversation.entry,
    id: appealId,
    initials: closedConversation.initials,
    language: closedConversation.language,
    messages: [],
    name: closedConversation.name,
    phone: closedConversation.phone,
    preview: "",
    previous: [...closedConversation.previous],
    ...(inheritedBinding ? { providerConversationId: inheritedBinding } : {}),
    ...(closedConversation.providerUserId ? { providerUserId: closedConversation.providerUserId } : {}),
    ...(closedConversation.queueId ? { queueId: closedConversation.queueId } : {}),
    sla: "Active",
    slaTone: "ok",
    status: "new",
    tags: isRepeatAppeal ? [...baseTags, REPEAT_APPEAL_TAG] : baseTags,
    tenantId: closedConversation.tenantId,
    time: "now",
    topic: defaultTopicForChannel(closedConversation),
    updatedAt: new Date().toISOString(),
    metadata: {
      anchorId,
      isRepeatAppeal,
      parentConversationId: closedConversation.id
    }
  }, anchorId);
}

export function releaseProviderBindingForClosedAppeal(conversation: ConversationRecord): ConversationRecord {
  if (!conversation.providerConversationId) {
    return conversation;
  }

  return {
    ...conversation,
    providerConversationId: undefined
  };
}

export async function resolveOrForkAppealConversation(
  input: ResolveAppealConversationInput
): Promise<ResolveAppealConversationResult | null> {
  if (!input.conversationRepository.saveConversationMutation) {
    return null;
  }

  const existing = await findLatestAppealConversation(input.conversationRepository, input.tenantId, input.anchorId);
  if (!existing) {
    const created = ensureAppealAnchorTag(input.createInitial(), input.anchorId);
    const mutation = input.createMutation(created, "conversation.created");
    const persisted = await input.conversationRepository.saveConversationMutation(mutation);
    return { conversation: persisted.conversation, forked: false };
  }

  if (existing.status !== "closed") {
    return { conversation: existing, forked: false };
  }

  if (input.interceptCsatFeedback && isAwaitingCsatFeedback(existing)) {
    return { conversation: existing, csatFeedbackAwaiting: true, forked: false };
  }

  const closedParent = releaseProviderBindingForClosedAppeal(existing);
  if (closedParent.id !== existing.id || closedParent.providerConversationId !== existing.providerConversationId) {
    await input.conversationRepository.saveConversationMutation(
      input.createMutation(closedParent, "conversation.updated")
    );
  }

  const followUp = buildFollowUpAppeal(existing, input.anchorId, input.providerConversationId);
  const mutation = input.createMutation(followUp, "conversation.created");
  const persisted = await input.conversationRepository.saveConversationMutation(mutation);

  return {
    conversation: persisted.conversation,
    forked: true,
    isRepeatAppeal: Boolean(followUp.metadata?.isRepeatAppeal)
  };
}

async function findLatestAppealConversation(
  repository: Pick<ConversationRepository, "findConversation" | "listConversations">,
  tenantId: string,
  anchorId: string
): Promise<ConversationRecord | undefined> {
  const anchorTag = appealAnchorTag(anchorId);
  const direct = await repository.findConversation(anchorId);
  const conversations = await repository.listConversations({ tenantId, take: 100, messageTake: 200 });
  const matches = conversations
    .filter((conversation) => conversation.tenantId === tenantId)
    .filter((conversation) => conversation.id === anchorId || conversation.tags.includes(anchorTag))
    .sort((left, right) => resolveSortTimestamp(right) - resolveSortTimestamp(left));

  if (matches.length > 0) {
    return matches[0];
  }

  return direct && direct.tenantId === tenantId ? direct : undefined;
}

function resolveSortTimestamp(conversation: ConversationRecord): number {
  const updatedAt = Date.parse(String(conversation.updatedAt ?? ""));
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const closedAt = resolveClosedAt(conversation);
  return closedAt?.getTime() ?? 0;
}

function findClosedHistoryEntries(previous: string[][]): Array<[string, string, string]> {
  return previous.flatMap((row) => {
    if (!Array.isArray(row) || row.length < 3) {
      return [];
    }

    if (String(row[2] ?? "").trim().toLowerCase() !== "closed") {
      return [];
    }

    return [[String(row[0] ?? ""), String(row[1] ?? ""), String(row[2] ?? "")]];
  });
}

function parseAppealHistoryDate(value: string): Date | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || trimmed === "-") {
    return undefined;
  }

  const isoCandidate = trimmed.length <= 10 ? `${trimmed}T00:00:00.000Z` : trimmed;
  const parsed = Date.parse(isoCandidate);
  return Number.isFinite(parsed) ? new Date(parsed) : undefined;
}

function defaultTopicForChannel(conversation: ConversationRecord): string {
  const channel = String(conversation.channel ?? "").trim();
  if (channel === "Telegram") {
    return "Telegram / Bot";
  }
  if (channel === "SDK") {
    return "SDK / Web widget";
  }
  if (channel === "VK" || channel === "MAX") {
    return `${channel} / Bot`;
  }

  return conversation.topic || `${channel || "Channel"} / Inbound`;
}
