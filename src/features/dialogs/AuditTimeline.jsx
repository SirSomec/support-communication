import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Bot } from "lucide-react";
import { statusLabels } from "../../app/dialogModel.js";
import { AttachmentPreview } from "./AttachmentPreview.jsx";
import {
  formatMessageTime,
  getVisibleMessages,
  isTranscriptPinnedToBottom,
  scrollTranscriptToBottom,
  shouldUpdatePinnedStateFromScroll
} from "./timelineModel.js";

const MESSAGE_TIME_TICK_MS = 1000;

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

export function AuditTimeline({ messages, onSaveTemplate, transcriptMode }) {
  const transcriptRef = useRef(null);
  const pinnedToBottomRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  const [timeNow, setTimeNow] = useState(() => new Date());
  const visibleMessages = getVisibleMessages(messages, transcriptMode);
  const lastVisibleMessageId = visibleMessages.at(-1)?.id ?? "";

  useEffect(() => {
    const timer = window.setInterval(() => setTimeNow(new Date()), MESSAGE_TIME_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollTranscriptToBottom(transcriptRef.current);
    }
  }, [lastVisibleMessageId, transcriptMode, visibleMessages.length]);

  function markUserScrollIntent() {
    userScrollIntentRef.current = true;
  }

  function handleTranscriptScroll() {
    if (!shouldUpdatePinnedStateFromScroll(userScrollIntentRef.current)) {
      return;
    }

    pinnedToBottomRef.current = isTranscriptPinnedToBottom(transcriptRef.current);
  }

  return (
    <div
      className="chat-transcript"
      onPointerDown={markUserScrollIntent}
      onScroll={handleTranscriptScroll}
      onTouchStart={markUserScrollIntent}
      onWheel={markUserScrollIntent}
      ref={transcriptRef}
    >
      <div className="day-divider">Сегодня</div>
      {visibleMessages.map((message) => (
        <MessageBubble key={message.id} message={message} now={timeNow} onSaveTemplate={onSaveTemplate} />
      ))}
      {!visibleMessages.length ? <div className="empty-transcript">Нет записей для выбранного фильтра</div> : null}
    </div>
  );
}

function MessageBubble({ message, now, onSaveTemplate }) {
  const displayTime = formatMessageTime(message, { now });

  if (message.type === "event") {
    return <AuditEventCard displayTime={displayTime} message={message} />;
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
          <time>{displayTime}</time>
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
        <time>{displayTime}</time>
      </footer>
    </article>
  );
}

function AuditEventCard({ displayTime, message }) {
  const fromStatusLabel = message.fromStatus ? statusLabels[message.fromStatus] ?? message.fromStatus : "";
  const toStatusLabel = message.toStatus ? statusLabels[message.toStatus] ?? message.toStatus : "";

  return (
    <article className={`audit-event-card ${message.eventKind ?? "legacy"}`}>
      <header>
        <span>{message.eventKind ? "Audit" : "Событие"}</span>
        <time>{displayTime}</time>
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
