import { useCallback, useMemo, useState } from "react";

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
  initialSelectedId = "maria"
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [pendingConversationId, setPendingConversationId] = useState(null);

  const selected = useMemo(
    () => conversationItems.find((conversation) => conversation.id === selectedId) ?? conversationItems[0] ?? EMPTY_CONVERSATION,
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

      if (hasUnsentComposerContent) {
        setPendingConversationId(nextConversationId);
        return;
      }

      setSelectedId(nextConversationId);
    },
    [hasUnsentComposerContent, selectedId]
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
