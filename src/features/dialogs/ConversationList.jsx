import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, Search, SlidersHorizontal } from "lucide-react";
import {
  getStatusMeta,
  queueSlaTones,
  queueWaitingStatuses,
  statusLabels
} from "../../app/dialogModel.js";
import { StatusBadge } from "../../ui.jsx";
import { Avatar } from "./Avatar.jsx";

export function ConversationList({
  conversations,
  allConversations,
  selectedId,
  onSelect,
  filter,
  onFilter,
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
    () => Array.from(new Set(allConversations.map((conversation) => conversation.channel))),
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
  const counters = {
    waiting: allConversations.filter((item) => queueWaitingStatuses.includes(item.status)).length,
    sla: allConversations.filter((item) => queueSlaTones.includes(item.slaTone)).length,
    rescue: allConversations.filter((item) => !topics[item.id] || item.slaTone === "danger").length,
    quality: allConversations.filter((item) => item.tags.some((tag) => ["жалоба", "важно", "возврат"].includes(tag.toLowerCase()))).length
  };

  return (
    <section className="conversation-list" aria-label="Список диалогов">
      <div className="queue-tabs">
        <TabButton id="mine" active={filter} onClick={onFilter} label="Мои" />
        <TabButton id="waiting" active={filter} onClick={onFilter} label="Ожидают" count={counters.waiting} tone="danger" />
        <TabButton id="sla" active={filter} onClick={onFilter} label="SLA" count={counters.sla} tone="warn" />
        <TabButton id="rescue" active={filter} onClick={onFilter} label="Спасти" count={counters.rescue} tone="danger" />
        <TabButton id="quality" active={filter} onClick={onFilter} label="Оценки" count={counters.quality} tone="warn" />
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
        {conversations.map((conversation) => (
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
                <time>{conversation.time}</time>
              </span>
              <span className={`channel-chip ${conversation.channel.toLowerCase()}`}>{conversation.channel}</span>
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
        ))}
        {!conversations.length ? (
          <div className="queue-empty">
            <strong>Нет диалогов</strong>
            <span>Измените фильтр или поисковый запрос.</span>
          </div>
        ) : null}
      </div>
      <footer className="queue-footer">
        <span>Показано {conversations.length} из {allConversations.length}</span>
        <div>
          <button aria-label="Назад" title="Назад" type="button"><ChevronLeft size={18} /></button>
          <button aria-label="Вперед" title="Вперед" type="button"><ChevronRight size={18} /></button>
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
