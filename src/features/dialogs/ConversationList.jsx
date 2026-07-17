import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, Search, SlidersHorizontal } from "lucide-react";
import {
  getConversationQualityAssessment,
  getStatusMeta,
  hasActiveRescue,
  isBotHandledConversation,
  matchesQueueTab,
  statusLabels
} from "../../app/dialogModel.js";
import { StatusBadge } from "../../ui.jsx";
import { RepeatAppealBadge } from "./RepeatAppealBadge.jsx";
import { Avatar } from "./Avatar.jsx";

export function ConversationList({
  conversations,
  allConversations,
  selectedId,
  onSelect,
  filter,
  onFilter,
  onPageChange,
  operatorId = "",
  pageLoading = false,
  pagination,
  queueFilters,
  onQueueFilterChange,
  onQueueFiltersReset,
  query,
  onQuery,
  topics,
  topicOptions = [],
  closedIds
}) {
  const [isFilterPanelOpen, setFilterPanelOpen] = useState(false);
  const channelOptions = useMemo(
    () => Array.from(new Set(allConversations.flatMap((conversation) => conversation.channels ?? [conversation.channel]))),
    [allConversations]
  );
  const queueOptions = useMemo(
    () => Array.from(new Set(allConversations.map((conversation) => conversation.queueId).filter(Boolean))),
    [allConversations]
  );
  const activeFilterCount = [
    queueFilters.channel !== "all",
    queueFilters.queueId !== "all",
    queueFilters.topic !== "all",
    queueFilters.status !== "all",
    queueFilters.sort !== "time",
    queueFilters.onlyInternal
  ].filter(Boolean).length;
  // Счетчик вкладки = размер ее списка: обе стороны считаются matchesQueueTab.
  const tabCount = (tab) => allConversations.filter((item) => matchesQueueTab(item, tab, { operatorId })).length;
  const counters = {
    mine: tabCount("mine"),
    waiting: tabCount("waiting"),
    sla: tabCount("sla"),
    rescue: tabCount("rescue"),
    bot: tabCount("bot"),
    quality: tabCount("quality")
  };
  const page = pagination?.page ?? 1;
  const total = pagination?.total ?? allConversations.length;

  return (
    <section className="conversation-list" aria-label="Список диалогов">
      <div className="queue-tabs">
        <TabButton id="mine" active={filter} onClick={onFilter} label="Мои" count={counters.mine} tone="neutral" />
        <TabButton id="waiting" active={filter} onClick={onFilter} label="Ожидают" count={counters.waiting} tone="danger" />
        <TabButton id="sla" active={filter} onClick={onFilter} label="SLA" count={counters.sla} tone="warn" />
        <TabButton id="rescue" active={filter} onClick={onFilter} label="Спасти" count={counters.rescue} tone="danger" />
        <TabButton id="quality" active={filter} onClick={onFilter} label="Оценки" count={counters.quality} tone="warn" />
        <TabButton id="bot" active={filter} onClick={onFilter} label="У бота" count={counters.bot} tone="info" />
        <TabButton id="all" active={filter} onClick={onFilter} label="Все" />
      </div>
      <div className="queue-controls">
        <div className="queue-search">
          <Search size={19} />
          <input aria-label="Поиск по диалогам" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Поиск по диалогам" />
          <button
            aria-expanded={isFilterPanelOpen}
            aria-label="Расширенные фильтры"
            className={isFilterPanelOpen ? "active" : ""}
            onClick={() => setFilterPanelOpen((current) => !current)}
            title="Расширенные фильтры"
            type="button"
          >
            <SlidersHorizontal size={19} />
            {activeFilterCount ? <span>{activeFilterCount}</span> : null}
          </button>
        </div>
        {isFilterPanelOpen ? (
          <div className="queue-filter-panel">
            <label>
              <span>Канал</span>
              <select value={queueFilters.channel} onChange={(event) => onQueueFilterChange("channel", event.target.value)}>
                <option value="all">Все каналы</option>
                {channelOptions.map((channel) => <option value={channel} key={channel}>{channel}</option>)}
              </select>
            </label>
            <label>
              <span>Очередь</span>
              <select value={queueFilters.queueId} onChange={(event) => onQueueFilterChange("queueId", event.target.value)}>
                <option value="all">Все очереди</option>
                {queueOptions.map((queueId) => <option value={queueId} key={queueId}>{queueId}</option>)}
              </select>
            </label>
            <label>
              <span>Тематика</span>
              <select value={queueFilters.topic} onChange={(event) => onQueueFilterChange("topic", event.target.value)}>
                <option value="all">Все тематики</option>
                <option value="none">Без тематики</option>
                {topicOptions.map((topic) => <option value={topic} key={topic}>{topic}</option>)}
              </select>
            </label>
            <label>
              <span>Статус</span>
              <select value={queueFilters.status} onChange={(event) => onQueueFilterChange("status", event.target.value)}>
                <option value="all">Все статусы</option>
                {Object.entries(statusLabels).map(([status, label]) => <option value={status} key={status}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Сортировка</span>
              <select value={queueFilters.sort} onChange={(event) => onQueueFilterChange("sort", event.target.value)}>
                <option value="time">Последнее сообщение</option>
                <option value="sla">SLA сначала</option>
                <option value="status">Статус</option>
                <option value="channel">Канал</option>
              </select>
            </label>
            <label className="queue-filter-check">
              <input
                type="checkbox"
                checked={queueFilters.onlyInternal}
                onChange={(event) => onQueueFilterChange("onlyInternal", event.target.checked)}
              />
              <span>Есть внутренний комментарий</span>
            </label>
            <button className="queue-filter-reset" onClick={onQueueFiltersReset} type="button">Сбросить</button>
          </div>
        ) : null}
        {activeFilterCount ? (
          <div className="active-filter-chips" aria-label="Активные фильтры">
            {queueFilters.channel !== "all" ? <span>Канал: {queueFilters.channel}</span> : null}
            {queueFilters.queueId !== "all" ? <span>Очередь: {queueFilters.queueId}</span> : null}
            {queueFilters.topic !== "all" ? <span>{queueFilters.topic === "none" ? "Без тематики" : queueFilters.topic}</span> : null}
            {queueFilters.status !== "all" ? <span>Статус: {statusLabels[queueFilters.status]}</span> : null}
            {queueFilters.sort !== "time" ? <span>Сортировка: {queueFilters.sort === "sla" ? "SLA" : queueFilters.sort === "status" ? "статус" : "канал"}</span> : null}
            {queueFilters.onlyInternal ? <span>Внутренние комментарии</span> : null}
          </div>
        ) : null}
      </div>
      <div className="queue-items">
        {conversations.map((conversation) => {
          const qualityAssessment = getConversationQualityAssessment(conversation);
          return (
          <button
            aria-current={selectedId === conversation.id ? "true" : undefined}
            className={`queue-row ${selectedId === conversation.id ? "selected" : ""} ${conversation.slaTone === "danger" ? "danger" : ""}`}
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
          >
            <Avatar conversation={conversation} />
            <span className="queue-body">
              <span className="queue-title">
                <strong>{conversation.name}</strong>
                <RepeatAppealBadge compact conversation={conversation} />
                <time>{conversation.time}</time>
              </span>
              <span className="queue-chip-row">
                {(conversation.channels ?? [conversation.channel]).map((channel) => (
                  <span className={`channel-chip ${String(channel).toLowerCase()}`} key={channel}>{channel}</span>
                ))}
                {(conversation.appealCount ?? 1) > 1 ? (
                  <span className="appeal-count-chip" title={`Обращений клиента: ${conversation.appealCount}`}>
                    {conversation.appealCount} обращ.
                  </span>
                ) : null}
                {isBotHandledConversation(conversation) ? (
                  <span className="queue-flag bot" title="Диалог сейчас обрабатывает бот">Бот</span>
                ) : null}
                {hasActiveRescue(conversation) ? (
                  <span className="queue-flag rescue" title="Запущено спасение диалога">Спасение</span>
                ) : null}
                {qualityAssessment ? (
                  <span
                    className={`queue-flag rating ${qualityAssessment.score === null ? "" : qualityAssessment.score < 4 ? "bad" : "good"}`}
                    title="Оценка клиента"
                  >
                    {qualityAssessment.scale} {qualityAssessment.score ?? "—"}
                  </span>
                ) : null}
              </span>
              <StatusBadge tone={getStatusMeta(conversation.status).tone}>{statusLabels[conversation.status] ?? conversation.status}</StatusBadge>
              <span className="queue-preview">{conversation.preview}</span>
              <span className={`queue-meta ${conversation.slaTone}`}>
                {conversation.slaTone === "danger" ? <AlertTriangle size={15} /> : null}
                {conversation.slaTone === "warn" || conversation.slaTone === "hold" ? <Clock3 size={15} /> : null}
                {closedIds.has(conversation.id) || conversation.status === "closed" ? "Закрыт" : conversation.sla}
              </span>
              {!topics[conversation.id] ? <span className="topic-warning">Для закрытия укажите тематику</span> : null}
            </span>
            {conversation.unread ? <span className="unread-dot" /> : null}
          </button>
          );
        })}
        {!conversations.length ? (
          <div className="queue-empty">
            <strong>Нет диалогов</strong>
            <span>Измените фильтр или поисковый запрос.</span>
          </div>
        ) : null}
      </div>
      <footer className="queue-footer">
        <span>Показано {conversations.length} · страница {page} из {pagination?.pageCount ?? 1} · всего {total}</span>
        <div>
          <button
            aria-label="Назад"
            disabled={pageLoading || !pagination?.canPrevious}
            onClick={() => void onPageChange?.(page - 1)}
            title="Предыдущая страница"
            type="button"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Вперед"
            disabled={pageLoading || !pagination?.canNext}
            onClick={() => void onPageChange?.(page + 1)}
            title="Следующая страница"
            type="button"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </footer>
    </section>
  );
}

function TabButton({ id, active, onClick, label, count, tone }) {
  return (
    <button aria-pressed={active === id} className={`queue-tab ${active === id ? "active" : ""}`} onClick={() => onClick(id)} type="button">
      {label}
      {count ? <span className={`tab-count ${tone ?? ""}`}>{count}</span> : null}
    </button>
  );
}
