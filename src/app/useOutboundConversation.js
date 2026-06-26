import { useCallback } from "react";
import { createOutboundConversation } from "./dialogModel.js";

export function useOutboundConversation({
  clearAttachments,
  handleBackToDialogs,
  setConversationItems,
  setDraft,
  setOutboundOpen,
  setSelectedId,
  setToast,
  setTopics
}) {
  const handleOutboundClose = useCallback(() => {
    setOutboundOpen(false);
  }, [setOutboundOpen]);

  const handleOutboundCreate = useCallback(
    (outbound) => {
      const newConversation = createOutboundConversation(outbound);

      setConversationItems((current) => [newConversation, ...current]);
      setTopics((current) => ({ ...current, [newConversation.id]: newConversation.topic }));
      setSelectedId(newConversation.id);
      setDraft("");
      clearAttachments();
      handleBackToDialogs();
      setOutboundOpen(false);
      setToast(`Исходящий диалог создан: ${outbound.phone}`);
    },
    [
      clearAttachments,
      handleBackToDialogs,
      setConversationItems,
      setDraft,
      setOutboundOpen,
      setSelectedId,
      setToast,
      setTopics
    ]
  );

  return {
    handleOutboundClose,
    handleOutboundCreate
  };
}
