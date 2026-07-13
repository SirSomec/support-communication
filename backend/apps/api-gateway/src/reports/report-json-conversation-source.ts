import { readFileSync } from "node:fs";
import type { ConversationReportSourceRow } from "./report.repository.js";

interface JsonConversationState {
  conversations?: Array<Record<string, unknown>>;
  lifecycleEvents?: Array<Record<string, unknown>>;
}

export function listJsonConversationReportSourceRows(input: {
  conversationStoreFile?: string;
  from: Date;
  tenantId: string;
  to: Date;
}): ConversationReportSourceRow[] {
  const filePath = String(input.conversationStoreFile ?? process.env.CONVERSATION_STORE_FILE ?? "").trim();
  if (!filePath) {
    return [];
  }

  let state: JsonConversationState;
  try {
    state = JSON.parse(readFileSync(filePath, "utf8")) as JsonConversationState;
  } catch {
    return [];
  }

  const conversations = new Map<string, Record<string, unknown>>();
  for (const conversation of state.conversations ?? []) {
    const id = String(conversation.id ?? "").trim();
    if (id) {
      conversations.set(id, conversation);
    }
  }

  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const grouped = new Map<string, ConversationReportSourceRow>();

  for (const event of state.lifecycleEvents ?? []) {
    const tenantId = String(event.tenantId ?? "").trim();
    if (tenantId !== input.tenantId) {
      continue;
    }

    const occurredAt = String(event.occurredAt ?? "").trim();
    const occurredMs = Date.parse(occurredAt);
    if (!Number.isFinite(occurredMs) || occurredMs < fromMs || occurredMs >= toMs) {
      continue;
    }

    const conversationId = String(event.conversationId ?? "").trim();
    if (!conversationId) {
      continue;
    }

    const conversation = conversations.get(conversationId);
    const current = grouped.get(conversationId) ?? createSourceRow(conversation, conversationId);
    current.lifecycleEvents!.push({
      ...(isRecord(event.data) ? { data: event.data } : {}),
      eventType: String(event.eventType ?? ""),
      ...(String(event.id ?? "").trim() ? { id: String(event.id) } : {}),
      ingestedAt: String(event.ingestedAt ?? occurredAt),
      occurredAt,
      ...(String(event.source ?? "").trim() ? { source: String(event.source) } : {})
    });
    grouped.set(conversationId, current);
  }

  return [...grouped.values()];
}

function createSourceRow(
  conversation: Record<string, unknown> | undefined,
  conversationId: string
): ConversationReportSourceRow {
  const messages = Array.isArray(conversation?.messages)
    ? conversation.messages
      .map((message) => {
        if (!isRecord(message)) {
          return null;
        }

        const createdAt = String(message.createdAt ?? message.time ?? "").trim();
        const id = String(message.id ?? "").trim();
        const text = String(message.text ?? "");
        if (!id || !createdAt) {
          return null;
        }

        return {
          createdAt,
          id,
          text,
          time: String(message.time ?? createdAt),
          ...(message.side === "agent" || message.side === "client" ? { side: message.side } : {}),
          ...(message.type === "event" || message.type === "internal" ? { type: message.type } : {})
        };
      })
      .filter((message): message is NonNullable<typeof message> => message !== null)
    : [];

  return {
    channel: String(conversation?.channel ?? "Unknown"),
    createdAt: String(conversation?.createdAt ?? conversation?.updatedAt ?? ""),
    id: conversationId,
    lifecycleEvents: [],
    messages,
    ...(String(conversation?.operatorId ?? "").trim() ? { operatorId: String(conversation?.operatorId) } : {}),
    ...(String(conversation?.operatorName ?? "").trim() ? { operatorName: String(conversation?.operatorName) } : {}),
    ...(String(conversation?.queueId ?? "").trim() ? { queueId: String(conversation?.queueId) } : {}),
    slaTone: String(conversation?.slaTone ?? ""),
    status: String(conversation?.status ?? "active"),
    ...(String(conversation?.teamId ?? "").trim() ? { teamId: String(conversation?.teamId) } : {}),
    topic: String(conversation?.topic ?? ""),
    updatedAt: String(conversation?.updatedAt ?? conversation?.createdAt ?? "")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
