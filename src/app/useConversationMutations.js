import { useCallback, useState } from "react";
import { createAuditEvent, getStatusMeta } from "./dialogModel.js";

const NOW_LABEL = "\u0441\u0435\u0439\u0447\u0430\u0441";
const ATTACHMENT_PREVIEW_LABEL = "\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435";

export function useConversationMutations({ initialConversations }) {
  const [conversationItems, setConversationItems] = useState(initialConversations);
  const [topics, setTopics] = useState(() =>
    Object.fromEntries(initialConversations.map((conversation) => [conversation.id, conversation.topic]))
  );
  const [closedIds, setClosedIds] = useState(
    () => new Set(initialConversations.filter((item) => item.status === "closed").map((item) => item.id))
  );

  const appendMessage = useCallback((conversationId, message) => {
    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        return {
          ...conversation,
          messages: [...conversation.messages, { id: Date.now(), ...message }],
          preview: message.text ?? (message.attachments?.length ? `${ATTACHMENT_PREVIEW_LABEL}: ${message.attachments[0].name}` : conversation.preview),
          time: NOW_LABEL
        };
      })
    );
  }, []);

  const applyConversationStatus = useCallback((conversationId, nextStatus, eventPayload) => {
    const meta = getStatusMeta(nextStatus);

    setConversationItems((current) =>
      current.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const previousStatus = conversation.status ?? "active";
        const auditEvent = eventPayload
          ? createAuditEvent({
              eventKind: "status",
              fromStatus: previousStatus,
              toStatus: nextStatus,
              ...(typeof eventPayload === "string" ? { detail: eventPayload } : eventPayload)
            })
          : null;

        const rescueState = nextStatus === "closed" && conversation.rescue
          ? {
              ...conversation.rescue,
              completedAt: Date.now(),
              outcome: "saved",
              state: "saved"
            }
          : conversation.rescue;

        return {
          ...conversation,
          status: nextStatus,
          sla: meta.sla,
          slaTone: meta.tone,
          ...(rescueState ? { rescue: rescueState } : {}),
          messages: auditEvent ? [...conversation.messages, auditEvent] : conversation.messages,
          time: NOW_LABEL
        };
      })
    );
  }, []);

  return {
    appendMessage,
    applyConversationStatus,
    closedIds,
    conversationItems,
    setClosedIds,
    setConversationItems,
    setTopics,
    topics
  };
}
