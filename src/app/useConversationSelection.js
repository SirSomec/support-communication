import { useCallback, useEffect, useMemo, useState } from "react";

const DRAFT_SWITCH_DISCARD_TOAST = "Черновик и очередь вложений сброшены.";
const EMPTY_CONVERSATION = {
  id: "empty",
  name: "Нет диалогов",
  initials: "--",
  avatar: "",
  channel: "SDK",
  phone: "",
  time: "сейчас",
  preview: "",
  status: "active",
  sla: "Новое",
  slaTone: "ok",
  topic: "",
  unread: false,
  device: "-",
  entry: "SDK",
  language: "Русский",
  clientSince: "-",
  tags: [],
  previous: [],
  messages: []
};

export function useConversationSelection({
  conversationItems,
  draft,
  hasAttachments,
  clearAttachments,
  setDraft,
  setToast,
  initialSelectedId = ""
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [pendingConversationId, setPendingConversationId] = useState(null);

  useEffect(() => {
    if (!conversationItems.length) {
      if (selectedId) {
        setSelectedId("");
      }
      return;
    }

    const hasSelectedConversation = conversationItems.some((conversation) => matchesSelection(conversation, selectedId));
    if (!hasSelectedConversation) {
      setSelectedId(conversationItems[0].id);
    }
  }, [conversationItems, selectedId]);

  const selected = useMemo(
    () => conversationItems.find((conversation) => matchesSelection(conversation, selectedId)) ?? conversationItems[0] ?? EMPTY_CONVERSATION,
    [conversationItems, selectedId]
  );
  const pendingConversation = useMemo(
    () =>
      pendingConversationId
        ? conversationItems.find((conversation) => conversation.id === pendingConversationId) ?? null
        : null,
    [conversationItems, pendingConversationId]
  );
  const hasUnsentComposerContent = Boolean(draft.trim() || hasAttachments);

  const handleConversationSelect = useCallback(
    (nextConversationId) => {
      if (nextConversationId === selectedId) {
        return;
      }

      // Переключение внутри того же клиентского треда (например, на другое
      // обращение клиента) не меняет окно чата — черновик терять не из-за чего.
      if (matchesSelection(selected, nextConversationId)) {
        setSelectedId(nextConversationId);
        return;
      }

      if (hasUnsentComposerContent) {
        setPendingConversationId(nextConversationId);
        return;
      }

      setSelectedId(nextConversationId);
    },
    [hasUnsentComposerContent, selected, selectedId]
  );

  const handleStayOnConversation = useCallback(() => {
    setPendingConversationId(null);
  }, []);

  const handleDiscardDraftAndSwitch = useCallback(() => {
    if (!pendingConversationId) {
      return;
    }

    setSelectedId(pendingConversationId);
    setDraft("");
    clearAttachments();
    setPendingConversationId(null);
    setToast(DRAFT_SWITCH_DISCARD_TOAST);
  }, [clearAttachments, pendingConversationId, setDraft, setToast]);

  return {
    handleConversationSelect,
    handleDiscardDraftAndSwitch,
    handleStayOnConversation,
    pendingConversation,
    selected,
    selectedId,
    setSelectedId
  };
}

// Элемент списка может быть клиентским тредом: он представляет и себя (id
// актуального обращения), и все связанные обращения из conversationIds.
function matchesSelection(conversation, conversationId) {
  if (!conversation || !conversationId) {
    return false;
  }

  if (conversation.id === conversationId) {
    return true;
  }

  return Array.isArray(conversation.conversationIds) && conversation.conversationIds.includes(conversationId);
}
