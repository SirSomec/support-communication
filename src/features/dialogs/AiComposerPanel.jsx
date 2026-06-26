import React from "react";
import { CheckCircle2, Pencil, Sparkles, X } from "lucide-react";
import { getAiSuggestionExplanation } from "../../app/aiQualityModel.js";
import { aiSuggestionStatusLabels } from "../../app/dialogModel.js";

export function AiComposerPanel({ suggestions = [], disabled, onAction }) {
  if (!suggestions.length) {
    return null;
  }

  return (
    <div className="inline-ai-panel" aria-label="AI-подсказки в чате">
      {suggestions.map((suggestion) => (
        <article className={`inline-ai-card ${suggestion.state}`} key={suggestion.id}>
          <header>
            <span>
              <Sparkles size={16} />
              <strong>{suggestion.title}</strong>
            </span>
            <b>{suggestion.confidence}%</b>
          </header>
          <p>{suggestion.text}</p>
          <div className="inline-ai-meta">
            <span>{suggestion.suggestedTopic}</span>
            <span>Тон: {suggestion.tone}</span>
            <span>Риск: {suggestion.risk}</span>
          </div>
          <details className="ai-explainability">
            <summary>Почему предложено</summary>
            <ul>
              {getAiSuggestionExplanation(suggestion).map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </details>
          <footer>
            <span className={`status-chip ${suggestion.state === "idle" ? "info" : suggestion.state === "rejected" ? "closed" : "ok"}`}>
              {aiSuggestionStatusLabels[suggestion.state] ?? aiSuggestionStatusLabels.idle}
            </span>
            <div>
              <button disabled={disabled} onClick={() => onAction(suggestion, "accept")} type="button">
                <CheckCircle2 size={15} />
                Принять
              </button>
              <button disabled={disabled} onClick={() => onAction(suggestion, "edit")} type="button">
                <Pencil size={15} />
                Редактировать
              </button>
              <button disabled={disabled} onClick={() => onAction(suggestion, "reject")} type="button">
                <X size={15} />
                Отклонить
              </button>
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
}
