import { useCallback, useMemo, useState } from "react";
import { aiActionLabels, getAiSuggestionDraft, getAiSuggestionMode } from "./dialogModel.js";
import { qualityService } from "../services/qualityService.js";

export function useAiSuggestions({
  suggestions,
  selectedId,
  isClosed,
  appendMessage,
  refreshInbox,
  setComposeMode,
  setDraft,
  setToast
}) {
  const [aiSuggestionStates, setAiSuggestionStates] = useState({});
  const [pendingSuggestionIds, setPendingSuggestionIds] = useState([]);

  const visibleAiSuggestions = useMemo(
    () =>
      suggestions
        .filter((suggestion) => suggestion.conversationId === selectedId && aiSuggestionStates[suggestion.id] !== "rejected")
        .map((suggestion) => ({
          ...suggestion,
          pending: pendingSuggestionIds.includes(suggestion.id),
          state: aiSuggestionStates[suggestion.id] ?? "idle"
        })),
    [aiSuggestionStates, pendingSuggestionIds, selectedId, suggestions]
  );

  const handleAiSuggestionAction = useCallback(
    async (suggestion, action) => {
      if (isClosed) {
        setToast("Диалог закрыт, AI-подсказки доступны только для просмотра.");
        return;
      }

      if (pendingSuggestionIds.includes(suggestion.id)) return;

      const suggestionDraft = action === "reject" ? "" : getAiSuggestionDraft(suggestion);
      setPendingSuggestionIds((current) => [...current, suggestion.id]);
      const response = await qualityService.recordSuggestionDecision({
        action,
        conversationId: selectedId,
        finalText: suggestionDraft,
        originalText: suggestion.text ?? suggestion.recommendation ?? "",
        scoringAuditId: suggestion.auditId,
        suggestionId: suggestion.id
      });
      setPendingSuggestionIds((current) => current.filter((id) => id !== suggestion.id));

      if (response.status !== "ok" || !(response.data?.decisionId || response.data?.decision?.decisionId)) {
        setToast(response.error?.message ?? "Не удалось сохранить решение по AI-подсказке.");
        return;
      }

      const nextState = action === "reject" ? "rejected" : action === "edit" ? "editing" : "accepted";
      setAiSuggestionStates((current) => ({ ...current, [suggestion.id]: nextState }));

      if (action !== "reject") {
        const nextMode = getAiSuggestionMode(suggestion);
        setComposeMode(nextMode);
        setDraft((current) => [current.trim(), suggestionDraft].filter(Boolean).join("\n\n"));
      }

      await refreshInbox?.();
      await appendMessage?.(selectedId, {
        actor: "AI copilot",
        detail: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
        eventKind: "ai",
        id: `ai-audit-${suggestion.id}-${action}-${Date.now()}`,
        text: `AI-подсказка ${aiActionLabels[action]}: ${suggestion.title}`,
        type: "event",
        time: "сейчас"
      }, { persist: false });
      setToast(`Решение по AI-подсказке сохранено: ${aiActionLabels[action]}.`);
    },
    [appendMessage, isClosed, pendingSuggestionIds, refreshInbox, selectedId, setComposeMode, setDraft, setToast]
  );

  return {
    handleAiSuggestionAction,
    visibleAiSuggestions
  };
}
