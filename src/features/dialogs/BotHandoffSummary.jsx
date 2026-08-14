import React, { useEffect, useState } from "react";
import { BookOpenCheck, Bot, ChevronDown, ChevronUp, Eye, EyeOff, Shuffle, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react";
import { automationService } from "../../services/automationService.js";
import { buildOperatorHandoffViewModel } from "./operatorHandoffModel.js";

const OUTCOMES = [
  { id: "helped", label: "Помогло", Icon: ThumbsUp },
  { id: "not_helped", label: "Не помогло", Icon: ThumbsDown },
  { id: "wrong_source", label: "Неверный источник", Icon: TriangleAlert }
];

export function BotHandoffSummary({
  canViewSensitive = false,
  conversationId = "",
  handoff = null,
  onFeedbackRecorded = null,
  phone = "",
  scenarioId = "",
  topic = ""
}) {
  const view = buildOperatorHandoffViewModel(handoff, { canViewSensitive, phone, topic });
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setSelected(null);
    setStatus("idle");
    setError("");
    setCollapsed(false);
    setHidden(false);
  }, [conversationId]);

  if (!view) return null;

  const contentId = `bot-handoff-summary-content-${conversationId}`;

  if (hidden) {
    return (
      <section className="bot-handoff-summary bot-handoff-summary--hidden" aria-label={`${view.title} скрыта`}>
        <button aria-label="Показать Handoff summary" onClick={() => setHidden(false)} type="button">
          <Eye size={15} aria-hidden="true" />
          Показать Handoff summary
        </button>
      </section>
    );
  }

  async function submitFeedback(outcome) {
    if (!conversationId || status === "saving") return;
    setStatus("saving");
    setError("");
    const response = await automationService.recordBotAiFeedback({
      citationSourceIds: (handoff?.citations ?? []).map((item) => item.sourceId).filter(Boolean),
      conversationId,
      outcome,
      scenarioId: scenarioId || handoff?.botId || undefined
    });
    if (response?.status !== "ok") {
      setStatus("error");
      setError(response?.error?.message || "Не удалось сохранить оценку");
      return;
    }
    setSelected(outcome);
    setStatus("saved");
    onFeedbackRecorded?.(response.data?.feedback ?? null);
  }

  return (
    <section className={`bot-handoff-summary${collapsed ? " is-collapsed" : ""}`} aria-label={view.title}>
      <header>
        <Bot size={16} aria-hidden="true" />
        <strong>{view.title}</strong>
        <span>{view.scenarioName} · {view.queue}</span>
        <div className="bot-handoff-summary-controls">
          <button
            aria-controls={contentId}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Развернуть Handoff summary" : "Свернуть Handoff summary"}
            onClick={() => setCollapsed((current) => !current)}
            title={collapsed ? "Развернуть" : "Свернуть"}
            type="button"
          >
            {collapsed ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
          </button>
          <button aria-label="Скрыть Handoff summary" onClick={() => setHidden(true)} title="Скрыть" type="button">
            <EyeOff size={16} aria-hidden="true" />
          </button>
        </div>
      </header>
      {!collapsed ? (
        <div className="bot-handoff-summary-content" id={contentId}>
          <div className="bot-handoff-summary-details">
            <span><b>Цель</b>{view.goal}</span>
            <span><b>Состояние</b>{view.sessionState}</span>
            <span><b>AI outcome</b>{view.aiOutcome}</span>
            <span><b>Причина передачи</b>{view.reasonLabel}</span>
            {view.topic ? <span><b>Тематика</b>{view.topic}</span> : null}
            {view.phone ? <span><b>Телефон</b>{view.phone}</span> : null}
            {view.citationsLabel ? (
              <span><b>Источники</b><BookOpenCheck size={14} aria-hidden="true" /> {view.citationsLabel}</span>
            ) : null}
            {view.fieldsLabel ? <span><b>Поля</b><Shuffle size={14} aria-hidden="true" /> {view.fieldsLabel}</span> : null}
          </div>
          <div className="bot-handoff-feedback" role="group" aria-label="Оценка ответа бота">
            {OUTCOMES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={selected === id ? "is-selected" : undefined}
                disabled={status === "saving" || status === "saved"}
                onClick={() => submitFeedback(id)}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
            {status === "saved" ? <span className="bot-handoff-feedback-note">Оценка сохранена. Знания не меняются без review.</span> : null}
            {error ? <span className="bot-handoff-feedback-error" role="alert">{error}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
