import React from "react";
import { BookOpen, Bot } from "lucide-react";
import { statusLabels } from "../../app/dialogModel.js";
import { AttachmentPreview } from "./AttachmentPreview.jsx";

export function BotHandoffSummary({ summary }) {
  return (
    <section className="bot-handoff-summary" aria-label="Резюме бота перед передачей оператору">
      <header>
        <Bot size={17} />
        <strong>Handoff summary: {summary.scenario}</strong>
        <span>{summary.reason}</span>
      </header>
      <div>
        <span>
          <b>Бот спросил</b>
          {summary.asked.join(", ")}
        </span>
        <span>
          <b>Получено</b>
          {summary.received.join(" · ")}
        </span>
        <span>
          <b>Дальше</b>
          Ответить оператору без повторного сбора данных
        </span>
      </div>
    </section>
  );
}

function getVisibleMessages(messages, transcriptMode) {
  if (transcriptMode === "internal") {
    return messages.filter((message) => message.type === "internal");
  }

  if (transcriptMode === "events") {
    return messages.filter((message) => message.type === "event");
  }

  return messages;
}

export function AuditTimeline({ messages, onSaveTemplate, transcriptMode }) {
  const visibleMessages = getVisibleMessages(messages, transcriptMode);

  return (
    <div className="chat-transcript">
      <div className="day-divider">Сегодня</div>
      {visibleMessages.map((message) => (
        <MessageBubble key={message.id} message={message} onSaveTemplate={onSaveTemplate} />
      ))}
      {!visibleMessages.length ? <div className="empty-transcript">Нет записей для выбранного фильтра</div> : null}
    </div>
  );
}

function MessageBubble({ message, onSaveTemplate }) {
  if (message.type === "event") {
    return <AuditEventCard message={message} />;
  }

  if (message.type === "internal") {
    return (
      <article className="internal-note">
        <strong>Внутренний комментарий</strong>
        <p>{message.text}</p>
        {message.attachments?.length ? (
          <div className="message-attachments">
            {message.attachments.map((attachment) => (
              <AttachmentPreview attachment={attachment} compact key={attachment.id} />
            ))}
          </div>
        ) : null}
        <footer>
          <span>{message.author}</span>
          <time>{message.time}</time>
        </footer>
      </article>
    );
  }

  return (
    <article className={`message-bubble ${message.side}`}>
      <p>{message.text}</p>
      {message.attachments?.length ? (
        <div className="message-attachments">
          {message.attachments.map((attachment) => (
            <AttachmentPreview attachment={attachment} compact key={attachment.id} />
          ))}
        </div>
      ) : null}
      <footer>
        {message.side === "agent" ? (
          <button
            aria-label="Сохранить сообщение как шаблон"
            onClick={() => onSaveTemplate(message.text)}
            title="Сохранить как шаблон"
            type="button"
          >
            <BookOpen size={14} />
          </button>
        ) : null}
        <time>{message.time}</time>
      </footer>
    </article>
  );
}

function AuditEventCard({ message }) {
  const fromStatusLabel = message.fromStatus ? statusLabels[message.fromStatus] ?? message.fromStatus : "";
  const toStatusLabel = message.toStatus ? statusLabels[message.toStatus] ?? message.toStatus : "";

  return (
    <article className={`audit-event-card ${message.eventKind ?? "legacy"}`}>
      <header>
        <span>{message.eventKind ? "Audit" : "Событие"}</span>
        <time>{message.time}</time>
      </header>
      <p>{message.detail ?? message.text}</p>
      <footer>
        {message.actor ? <span>{message.actor}</span> : null}
        {fromStatusLabel || toStatusLabel ? (
          <b>
            {fromStatusLabel ? <i>{fromStatusLabel}</i> : null}
            {fromStatusLabel && toStatusLabel ? " -> " : null}
            {toStatusLabel ? <i>{toStatusLabel}</i> : null}
          </b>
        ) : null}
        {message.fromTopic || message.toTopic ? (
          <b>
            {message.fromTopic ? <i>{message.fromTopic}</i> : null}
            {message.fromTopic && message.toTopic ? " -> " : null}
            {message.toTopic ? <i>{message.toTopic}</i> : null}
          </b>
        ) : null}
      </footer>
    </article>
  );
}
