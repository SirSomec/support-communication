import React, { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { statusLabels } from "../../app/dialogModel.js";
import { AttachmentPreview } from "./AttachmentPreview.jsx";
import {
  formatMessageTime,
  isTranscriptPinnedToBottom,
  scrollTranscriptToBottom,
  shouldUpdatePinnedStateFromScroll
} from "./timelineModel.js";

const MESSAGE_TIME_TICK_MS = 1000;
const APPEAL_HIGHLIGHT_MS = 2200;

export function AuditTimeline({ appealScrollTarget, conversationId, onSaveTemplate, timeline = [] }) {
  const transcriptRef = useRef(null);
  const pinnedToBottomRef = useRef(true);
  const userScrollIntentRef = useRef(false);
  const highlightTimerRef = useRef(0);
  const [timeNow, setTimeNow] = useState(() => new Date());
  const [highlightedAppealId, setHighlightedAppealId] = useState("");
  const messageItems = timeline.filter((item) => item.kind === "message");
  const lastVisibleMessageKey = messageItems.at(-1)?.key ?? "";

  useEffect(() => {
    const timer = window.setInterval(() => setTimeNow(new Date()), MESSAGE_TIME_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    pinnedToBottomRef.current = true;
    userScrollIntentRef.current = false;
    setHighlightedAppealId("");
    window.clearTimeout(highlightTimerRef.current);
    scrollTranscriptToBottom(transcriptRef.current);
  }, [conversationId]);

  useEffect(() => {
    if (pinnedToBottomRef.current) {
      scrollTranscriptToBottom(transcriptRef.current);
    }
  }, [lastVisibleMessageKey, messageItems.length]);

  // Переход из «Предыдущих диалогов»: окно чата перемещается к выбранному
  // обращению и подсвечивает его разделитель.
  useEffect(() => {
    if (!appealScrollTarget?.conversationId) {
      return undefined;
    }

    const container = transcriptRef.current;
    const anchor = container?.querySelector(`[data-appeal-id="${cssEscape(appealScrollTarget.conversationId)}"]`);
    if (!anchor) {
      return undefined;
    }

    pinnedToBottomRef.current = isAnchorNearBottom(container, anchor);
    container.scrollTop = anchor.offsetTop - container.offsetTop - 8;
    setHighlightedAppealId(appealScrollTarget.conversationId);
    window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlightedAppealId(""), APPEAL_HIGHLIGHT_MS);
    return undefined;
  }, [appealScrollTarget?.conversationId, appealScrollTarget?.token]);

  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);

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
      {timeline.map((item) => item.kind === "appeal" ? (
        <AppealDivider highlighted={item.conversationId === highlightedAppealId} item={item} key={item.key} />
      ) : (
        <MessageBubble key={item.key} message={item.message} now={timeNow} onSaveTemplate={onSaveTemplate} />
      ))}
      {!messageItems.length ? <div className="empty-transcript">Нет записей для выбранного фильтра</div> : null}
    </div>
  );
}

function AppealDivider({ highlighted, item }) {
  return (
    <div
      aria-label={`Обращение ${item.index} из ${item.total}`}
      className={`appeal-divider${highlighted ? " highlighted" : ""}${item.isCurrent ? " current" : ""}`}
      data-appeal-id={item.conversationId}
    >
      <span className="appeal-divider-title">
        Обращение {item.index}/{item.total}
        {item.isCurrent ? <i className="appeal-divider-current">текущее</i> : null}
      </span>
      <span className="appeal-divider-meta">
        <time>{item.dateLabel}</time>
        {item.channel ? <span className={`channel-chip ${item.channel.toLowerCase()}`}>{item.channel}</span> : null}
        {item.topic ? <span className="appeal-divider-topic">{item.topic}</span> : null}
        <b className={`appeal-divider-status ${item.isClosed ? "closed" : "open"}`}>{item.statusLabel}</b>
      </span>
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
      {message.side === "agent" && message.author ? <span className="message-author">{message.author}</span> : null}
      <p>{message.text}</p>
      {message.citations?.length ? <div className="message-citations"><strong>Источники AI:</strong>{message.citations.map((citation) => <span key={`${citation.sourceId}-${citation.version ?? ""}`}>{citation.title ?? citation.sourceId}</span>)}</div> : null}
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
        {message.channel ? (
          <span className="message-channel" title={`Канал сообщения: ${message.channel}`}>{message.channel}</span>
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

function isAnchorNearBottom(container, anchor) {
  if (!container || !anchor) {
    return false;
  }

  const anchorOffset = anchor.offsetTop - container.offsetTop;
  return container.scrollHeight - anchorOffset <= container.clientHeight;
}

function cssEscape(value) {
  if (typeof window !== "undefined" && window.CSS?.escape) {
    return window.CSS.escape(String(value));
  }
  return String(value).replace(/["\\\]]/g, "\\$&");
}
