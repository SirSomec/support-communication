import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Archive, Search } from "lucide-react";
import { mapApiConversation } from "../../app/conversationApiMapper.js";
import { maskPhone } from "../../app/dialogModel.js";
import { dialogService } from "../../services/dialogService.js";
import { Modal } from "../../ui.jsx";
import {
  clientHistoryStatusFilters,
  collectClientHistoryChannels,
  filterClientDialogHistory,
  paginateClientDialogHistory
} from "./clientDialogHistoryModel.js";
import { formatMessageTime } from "./timelineModel.js";

export function ClientDialogTranscriptModal({ entry, clientName, navigateError, navigating, onClose, onNavigate }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(entry.kind === "conversation" && !entry.isCurrent);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (entry.kind !== "conversation" || entry.isCurrent) {
      return undefined;
    }

    let ignore = false;
    setDetail(null);
    setLoading(true);
    setLoadError("");
    void dialogService.fetchDialogDetail(entry.conversationId).then((response) => {
      if (ignore) {
        return;
      }

      if (response.status === "ok" && response.data?.conversation) {
        setDetail(mapApiConversation(response.data.conversation));
      } else {
        setLoadError(response.error?.message ?? "Не удалось обновить переписку — показана сохраненная копия.");
      }
      setLoading(false);
    });

    return () => {
      ignore = true;
    };
  }, [entry.conversationId, entry.isCurrent, entry.kind]);

  const conversation = detail ?? entry.conversation;
  const messages = useMemo(
    () => (Array.isArray(conversation?.messages) ? conversation.messages.filter((message) => message && message.type !== "event") : []),
    [conversation]
  );
  const renderTime = new Date();

  return (
    <Modal
      eyebrow={`История клиента${clientName ? ` · ${clientName}` : ""}`}
      footer={
        <>
          {entry.isCurrent ? <span className="client-history-footer-hint">Это текущий диалог</span> : null}
          <button onClick={onClose} type="button">Закрыть</button>
          {entry.kind === "conversation" && !entry.isCurrent ? (
            <button className="primary-action" disabled={navigating} onClick={() => onNavigate(entry)} type="button">
              <ArrowUpRight size={17} />
              {navigating ? "Открываем..." : "Перейти в диалог"}
            </button>
          ) : null}
        </>
      }
      onClose={onClose}
      overlayClassName="client-history-overlay"
      panelClassName="client-history-panel client-history-transcript-panel"
      title={entry.title}
      titleId="client-history-transcript-title"
    >
      <div className="client-history-meta">
        <b className={`client-history-status ${entry.isClosed ? "closed" : "open"}`}>{entry.statusLabel}</b>
        <span>{entry.dateLabel}</span>
        {entry.channel ? <span>{entry.channel}</span> : null}
        {entry.kind === "archive" ? <span className="client-history-chip"><Archive size={13} /> Архив</span> : null}
      </div>

      {navigateError ? <p className="client-history-note error inline" role="alert">{navigateError}</p> : null}

      {entry.kind === "archive" ? (
        <div className="client-history-archive-note">
          <p>Это запись из свернутой истории обращений клиента: {entry.dateLabel} · {entry.title} · {entry.statusLabel}.</p>
          <p>Переписка хранится только для диалогов из рабочего списка — выберите диалог со значком перехода, чтобы открыть его сообщения.</p>
        </div>
      ) : (
        <div aria-label="Переписка диалога" className="client-history-transcript">
          {loadError ? <p className="client-history-note error" role="alert">{loadError}</p> : null}
          {loading ? <p className="client-history-note" role="status">Загружаем переписку...</p> : null}
          {!loading && !messages.length ? <p className="client-history-note">В этом диалоге пока нет сообщений.</p> : null}
          {messages.map((message) => (
            <TranscriptMessage key={message.id} message={message} now={renderTime} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function TranscriptMessage({ message, now }) {
  const displayTime = formatMessageTime(message, { now });

  if (message.type === "internal") {
    return (
      <article className="internal-note">
        <strong>Внутренний комментарий</strong>
        <p>{message.text}</p>
        <footer>
          <span>{message.author}</span>
          <time>{displayTime}</time>
        </footer>
      </article>
    );
  }

  return (
    <article className={`message-bubble ${message.side === "agent" ? "agent" : "client"}`}>
      {message.side === "agent" && message.author ? <span className="message-author">{message.author}</span> : null}
      <p>{message.text}</p>
      <footer>
        <time>{displayTime}</time>
      </footer>
    </article>
  );
}

export function ClientDialogsListModal({
  clientName,
  clientPhone,
  canViewSensitive,
  entries,
  fetchState,
  filters,
  navigateError,
  navigating,
  onClose,
  onFiltersChange,
  onNavigate,
  onOpenTranscript
}) {
  const channels = useMemo(() => collectClientHistoryChannels(entries), [entries]);
  const filtered = useMemo(() => filterClientDialogHistory(entries, filters), [entries, filters]);
  const pageData = useMemo(
    () => paginateClientDialogHistory(filtered, { page: filters.page }),
    [filtered, filters.page]
  );
  const visiblePhone = clientPhone ? (canViewSensitive ? clientPhone : maskPhone(clientPhone)) : "";
  const hasActiveFilters = Boolean(String(filters.query ?? "").trim()) || filters.status !== "all" || filters.channel !== "all";

  return (
    <Modal
      eyebrow={`${entries.length} обращ.${visiblePhone ? ` · ${visiblePhone}` : ""}`}
      footer={
        <>
          <span className="client-history-footer-hint">Клик по строке открывает переписку</span>
          <button onClick={onClose} type="button">Закрыть</button>
        </>
      }
      onClose={onClose}
      overlayClassName="client-history-overlay"
      panelClassName="client-history-panel client-history-list-panel"
      title={`Диалоги клиента${clientName ? ` · ${clientName}` : ""}`}
      titleId="client-history-list-title"
    >
      <div className="client-history-toolbar">
        <label className="client-history-search">
          <Search size={16} />
          <input
            aria-label="Поиск по диалогам клиента"
            onChange={(event) => onFiltersChange({ page: 1, query: event.target.value })}
            placeholder="Тема, текст сообщения, статус"
            type="search"
            value={filters.query}
          />
        </label>
        <select
          aria-label="Фильтр по статусу"
          onChange={(event) => onFiltersChange({ page: 1, status: event.target.value })}
          value={filters.status}
        >
          {clientHistoryStatusFilters.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        {channels.length > 1 ? (
          <select
            aria-label="Фильтр по каналу"
            onChange={(event) => onFiltersChange({ channel: event.target.value, page: 1 })}
            value={filters.channel}
          >
            <option value="all">Все каналы</option>
            {channels.map((channel) => (
              <option key={channel} value={channel}>{channel}</option>
            ))}
          </select>
        ) : null}
      </div>

      {fetchState?.loading ? <p className="client-history-note inline" role="status">Обновляем полный список диалогов...</p> : null}
      {fetchState?.error ? <p className="client-history-note error inline" role="alert">{fetchState.error}</p> : null}
      {navigateError ? <p className="client-history-note error inline" role="alert">{navigateError}</p> : null}

      <div className="client-history-items">
        {pageData.items.map((entry) => (
          <article className={`client-history-item ${entry.isCurrent ? "current" : ""}`} key={entry.key}>
            <button
              className="client-history-item-open"
              onClick={() => onOpenTranscript(entry)}
              title={entry.kind === "conversation" ? "Открыть переписку" : "Открыть детали архивной записи"}
              type="button"
            >
              <time>{entry.dateLabel}</time>
              <span className="client-history-item-body">
                <strong>{entry.title}</strong>
                <small>{entry.preview || entry.channel}</small>
              </span>
              <span className="client-history-item-badges">
                {entry.isCurrent ? <i className="client-history-chip accent">Текущий</i> : null}
                {entry.kind === "archive" ? <i className="client-history-chip"><Archive size={12} /> Архив</i> : null}
                {entry.channel ? <i className="client-history-chip">{entry.channel}</i> : null}
                <b className={`client-history-status ${entry.isClosed ? "closed" : "open"}`}>{entry.statusLabel}</b>
              </span>
            </button>
            {entry.kind === "conversation" && !entry.isCurrent ? (
              <button
                className="client-history-item-go"
                disabled={navigating}
                onClick={() => onNavigate(entry)}
                title="Перейти в диалог"
                type="button"
              >
                <ArrowUpRight size={16} />
                Перейти
              </button>
            ) : null}
          </article>
        ))}
        {!pageData.items.length ? (
          <div className="client-history-empty">
            <strong>{hasActiveFilters ? "Ничего не найдено" : "Истории пока нет"}</strong>
            <span>{hasActiveFilters ? "Измените запрос или сбросьте фильтры." : "Новые обращения клиента появятся в этом списке."}</span>
          </div>
        ) : null}
      </div>

      {pageData.total > pageData.pageSize ? (
        <footer className="client-history-pagination">
          <button disabled={pageData.page <= 1} onClick={() => onFiltersChange({ page: pageData.page - 1 })} type="button">
            Назад
          </button>
          <span>Страница {pageData.page} из {pageData.totalPages} · {pageData.total} обращ.</span>
          <button disabled={pageData.page >= pageData.totalPages} onClick={() => onFiltersChange({ page: pageData.page + 1 })} type="button">
            Вперед
          </button>
        </footer>
      ) : null}
    </Modal>
  );
}
