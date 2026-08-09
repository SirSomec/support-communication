import React, { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Search } from "lucide-react";
import { ChannelList, StatusBadge } from "../../ui.jsx";
import { buildScenarioListRow } from "./automationModel.js";

const FILTERS = [
  { label: "Все", value: "all" },
  { label: "Активные", value: "published" },
  { label: "Требуют внимания", value: "attention" },
  { label: "Черновики", value: "draft" }
];

export function ScenarioListPanel({
  aiReadiness,
  knowledgeSources,
  knowledgeSourcesError,
  knowledgeSourcesLoading,
  onOpen,
  onRetry,
  partial,
  scenarios,
  selectedScenarioId,
  versions,
  workspaceError
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const rows = useMemo(() => scenarios.map((scenario) => ({
    scenario,
    ...buildScenarioListRow(scenario, { aiReadiness, knowledgeSources, versions })
  })), [aiReadiness, knowledgeSources, scenarios, versions]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    const matchesQuery = !normalizedQuery || [row.name, row.triggerSummary, ...(row.channels ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
    const needsAttention = row.hasErrors || ["draft", "disabled"].includes(row.status);
    const matchesFilter = filter === "all"
      || (filter === "attention" && needsAttention)
      || row.status === filter;
    return matchesQuery && matchesFilter;
  });
  const attentionCount = rows.filter((row) => row.hasErrors || ["draft", "disabled"].includes(row.status)).length;

  return (
    <aside className="work-panel scenario-list-panel" aria-label="Список ботов">
      <header className="scenario-list-panel__header">
        <div>
          <strong>Список ботов</strong>
          <span>{rows.length ? `${rows.length} в рабочем пространстве` : "Ботов пока нет"}</span>
        </div>
        {attentionCount ? <StatusBadge tone="warn">{attentionCount} требуют внимания</StatusBadge> : null}
      </header>

      <label className="scenario-list-search">
        <Search aria-hidden="true" size={16} />
        <span className="sr-only">Поиск ботов</span>
        <input onChange={(event) => setQuery(event.target.value)} placeholder="Поиск ботов" type="search" value={query} />
      </label>

      <div className="scenario-list-filters" aria-label="Фильтр ботов">
        {FILTERS.map((item) => (
          <button aria-pressed={filter === item.value} className={filter === item.value ? "active" : ""} key={item.value} onClick={() => setFilter(item.value)} type="button">
            {item.label}
          </button>
        ))}
      </div>

      {workspaceError ? (
        <div className="scenario-list-state scenario-list-state--error" role="alert">
          <AlertTriangle size={17} />
          <div>
            <strong>Не удалось обновить список</strong>
            <span>{workspaceError}</span>
            {onRetry ? <button onClick={onRetry} type="button">Повторить</button> : null}
          </div>
        </div>
      ) : null}

      {partial || knowledgeSourcesError || knowledgeSourcesLoading ? (
        <div className={`scenario-list-state ${knowledgeSourcesError ? "scenario-list-state--warn" : "scenario-list-state--info"}`} role="status">
          <AlertTriangle size={16} />
          <span>{knowledgeSourcesLoading ? "Проверяем подключённые источники." : knowledgeSourcesError ? "Часть данных о знаниях недоступна." : "Часть данных может быть неактуальна."}</span>
        </div>
      ) : null}

      {!rows.length && !workspaceError ? (
        <div className="entity-empty scenario-list-empty">
          <Bot size={22} />
          <strong>Ботов пока нет</strong>
          <span>Создайте первого бота, чтобы настроить сценарий, проверить его и опубликовать.</span>
        </div>
      ) : null}

      {visibleRows.length ? (
        <div className="scenario-list scenario-list--compact">
          {visibleRows.map((row) => {
            const selected = selectedScenarioId === row.id;
            const needsAttention = row.hasErrors || ["draft", "disabled"].includes(row.status);
            return (
              <button aria-current={selected ? "true" : undefined} className={`scenario-list-item ${selected ? "selected" : ""}`} key={row.id} onClick={() => onOpen?.(row.scenario)} type="button">
                <span className="scenario-list-item__icon"><Bot aria-hidden="true" size={18} /></span>
                <span className="scenario-list-item__content">
                  <span className="scenario-list-item__title"><strong>{row.name}</strong><StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge></span>
                  <ChannelList channels={row.channels} />
                  <small className={needsAttention ? "attention" : ""}>{needsAttention ? (row.errors?.[0] ?? "Нужно проверить настройки") : row.triggerSummary}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : rows.length && !workspaceError ? (
        <div className="scenario-list-empty scenario-list-empty--filtered">
          <CheckCircle2 size={20} />
          <strong>Ничего не найдено</strong>
          <button onClick={() => { setQuery(""); setFilter("all"); }} type="button">Сбросить фильтры</button>
        </div>
      ) : null}
    </aside>
  );
}
