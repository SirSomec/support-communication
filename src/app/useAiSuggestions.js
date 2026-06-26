import { useCallback, useMemo, useState } from "react";
import { aiActionLabels, getAiSuggestionDraft, getAiSuggestionMode } from "./dialogModel.js";

export function useAiSuggestions({
  suggestions,
  selectedId,
  isClosed,
  appendMessage,
  setComposeMode,
  setDraft,
  setToast
}) {
  const [aiSuggestionStates, setAiSuggestionStates] = useState({});

  const visibleAiSuggestions = useMemo(
    () =>
      suggestions
        .filter((suggestion) => suggestion.conversationId === selectedId && aiSuggestionStates[suggestion.id] !== "rejected")
        .map((suggestion) => ({
          ...suggestion,
          state: aiSuggestionStates[suggestion.id] ?? "idle"
        })),
    [aiSuggestionStates, selectedId, suggestions]
  );

  const handleAiSuggestionAction = useCallback(
    (suggestion, action) => {
      if (isClosed) {
        setToast("Диалог закрыт, AI-подсказки доступны только для просмотра.");
        return;
      }

      const nextState = action === "reject" ? "rejected" : action === "edit" ? "editing" : "accepted";
      setAiSuggestionStates((current) => ({ ...current, [suggestion.id]: nextState }));

      if (action !== "reject") {
        const suggestionDraft = getAiSuggestionDraft(suggestion);
        const nextMode = getAiSuggestionMode(suggestion);
        setComposeMode(nextMode);
        setDraft((current) => [current.trim(), suggestionDraft].filter(Boolean).join("\n\n"));
      }

      appendMessage(selectedId, {
        actor: "AI copilot",
        detail: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
        eventKind: "ai",
        id: `ai-audit-${suggestion.id}-${action}-${Date.now()}`,
        text: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
        type: "event",
        time: "сейчас"
      });
      setToast(`AI-действие записано в audit: ${suggestion.title}.`);
    },
    [appendMessage, isClosed, selectedId, setComposeMode, setDraft, setToast]
  );

  return {
    handleAiSuggestionAction,
    visibleAiSuggestions
  };
}
