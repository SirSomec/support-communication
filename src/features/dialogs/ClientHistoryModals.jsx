import React, { useMemo } from "react";
import { ArrowUpRight, Archive, Search } from "lucide-react";
import { maskPhone } from "../../app/dialogModel.js";
import { Modal } from "../../ui.jsx";
import {
  clientHistoryStatusFilters,
  collectClientHistoryChannels,
  filterClientDialogHistory,
  paginateClientDialogHistory
} from "./clientDialogHistoryModel.js";

// Детали архивной строки истории обращений: у нее нет диалога в рабочем
// списке, поэтому перейти к переписке нельзя — показываем сводку записи.
export function ClientArchiveDetailModal({ entry, clientName, onClose }) {
  return (
    <Modal
      eyebrow={`История клиента${clientName ? ` · ${clientName}` : ""}`}
      footer={<button onClick={onClose} type="button">Закрыть</button>}
      onClose={onClose}
      overlayClassName="client-history-overlay"
      panelClassName="client-history-panel client-history-transcript-panel"
      title={entry.title}
      titleId="client-history-archive-title"
    >
      <div className="client-history-meta">
        <b className={`client-history-status ${entry.isClosed ? "closed" : "open"}`}>{entry.statusLabel}</b>
        <span>{entry.dateLabel}</span>
        {entry.channel ? <span>{entry.channel}</span> : null}
        <span className="client-history-chip"><Archive size={13} /> Архив</span>
      </div>

      <div className="client-history-archive-note">
        <p>Это запись из свернутой истории обращений клиента: {entry.dateLabel} · {entry.title} · {entry.statusLabel}.</p>
        <p>Переписка хранится только для обращений из рабочего списка — выберите обращение со значком перехода, чтобы окно чата переместилось к нему.</p>
      </div>
    </Modal>
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
  onOpenArchiveEntry
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
          <span className="client-history-footer-hint">Клик по обращению перемещает окно чата к нему</span>
          <button onClick={onClose} type="button">Закрыть</button>
        </>
      }
      onClose={onClose}
      overlayClassName="client-history-overlay"
      panelClassName="client-history-panel client-history-list-panel"
      title={`Диалог клиента${clientName ? ` · ${clientName}` : ""}`}
      titleId="client-history-list-title"
    >
      <div className="client-history-toolbar">
        <label className="client-history-search">
          <Search size={16} />
          <input
            aria-label="Поиск по обращениям клиента"
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

      {fetchState?.loading ? <p className="client-history-note inline" role="status">Обновляем полный список обращений...</p> : null}
      {fetchState?.error ? <p className="client-history-note error inline" role="alert">{fetchState.error}</p> : null}
      {navigateError ? <p className="client-history-note error inline" role="alert">{navigateError}</p> : null}

      <div className="client-history-items">
        {pageData.items.map((entry) => (
          <article className={`client-history-item ${entry.isCurrent ? "current" : ""}`} key={entry.key}>
            <button
              className="client-history-item-open"
              disabled={entry.kind === "conversation" && navigating}
              onClick={() => (entry.kind === "conversation" ? onNavigate(entry) : onOpenArchiveEntry(entry))}
              title={entry.kind === "conversation" ? "Переместить окно чата к обращению" : "Открыть детали архивной записи"}
              type="button"
            >
              <time>{entry.dateLabel}</time>
              <span className="client-history-item-body">
                <strong>{entry.title}</strong>
                <small>{entry.preview || entry.channel}</small>
              </span>
              <span className="client-history-item-badges">
                {entry.isCurrent ? <i className="client-history-chip accent">Текущее</i> : null}
                {entry.kind === "archive" ? <i className="client-history-chip"><Archive size={12} /> Архив</i> : null}
                {entry.channel ? <i className="client-history-chip">{entry.channel}</i> : null}
                <b className={`client-history-status ${entry.isClosed ? "closed" : "open"}`}>{entry.statusLabel}</b>
                {entry.kind === "conversation" ? <ArrowUpRight aria-hidden="true" size={15} /> : null}
              </span>
            </button>
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
