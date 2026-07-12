import React from "react";
import { BookOpenCheck, Bot, Shuffle } from "lucide-react";
import { buildOperatorHandoffViewModel } from "./operatorHandoffModel.js";

export function BotHandoffSummary({
  canViewSensitive = false,
  handoff = null,
  phone = "",
  topic = ""
}) {
  const view = buildOperatorHandoffViewModel(handoff, { canViewSensitive, phone, topic });
  if (!view) return null;

  return (
    <section className="bot-handoff-summary" aria-label={view.title}>
      <header>
        <Bot size={16} aria-hidden="true" />
        <strong>{view.title}</strong>
        <span>{view.scenarioName} · {view.queue}</span>
      </header>
      <div>
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
    </section>
  );
}
