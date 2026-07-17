import React, { useMemo } from "react";
import { AlertCircle, BookOpenCheck, Check, Database, FileText, Link2 } from "lucide-react";
import { describeScenarioSourceState } from "./scenarioKnowledgeSourceState.js";

const EMPTY_SOURCES = [];

/**
 * Controlled selector for knowledge sources that are safe to use in a bot scenario.
 * Data loading deliberately stays outside of this component so it can be used in the
 * creation wizard, scenario settings, and a future source catalogue without API coupling.
 */
export function ScenarioKnowledgeSourceSelector({
  disabled = false,
  emptyMessage = "Источников пока нет. Загрузите файлы, создайте источник из статьи или добавьте URL-страницу.",
  error = "",
  id = "scenario-knowledge-sources",
  isLoading = false,
  onSelectedSourceIdsChange,
  selectedSourceIds = EMPTY_SOURCES,
  sources = EMPTY_SOURCES
}) {
  const selectedIds = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
  const visibleSources = useMemo(
    () => sources
      .map((source) => ({ source, state: describeScenarioSourceState(source) }))
      .filter((item) => !item.state.hidden),
    [sources]
  );

  function toggleSource(sourceId) {
    if (disabled || isLoading) {
      return;
    }

    const nextIds = selectedIds.has(sourceId)
      ? selectedSourceIds.filter((id) => id !== sourceId)
      : [...selectedSourceIds, sourceId];
    onSelectedSourceIdsChange?.(nextIds);
  }

  return (
    <fieldset aria-describedby={`${id}-help`} className="scenario-knowledge-source-selector" disabled={disabled || isLoading}>
      <legend>Источники знаний для AI-ответов</legend>
      <p id={`${id}-help`}>Подходят любые источники: документы-файлы, статьи, URL-страницы и MCP-подключения. Бот будет искать ответ в выбранных и укажет, когда информации недостаточно.</p>

      {isLoading ? <div className="scenario-knowledge-source-state" role="status">Проверяем доступные источники…</div> : null}

      {!isLoading && error ? (
        <div className="scenario-knowledge-source-state error" role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {!isLoading && !error && visibleSources.length === 0 ? (
        <div className="scenario-knowledge-source-state empty">
          <BookOpenCheck aria-hidden="true" size={18} />
          <span>{emptyMessage}</span>
        </div>
      ) : null}

      {!isLoading && !error && visibleSources.length > 0 ? (
        <ul aria-label="Источники знаний" className="scenario-knowledge-source-list">
          {visibleSources.map(({ source, state }) => {
            const selected = selectedIds.has(source.id);
            const SourceIcon = getSourceIcon(source);
            const label = source.title || source.name || "Источник без названия";

            return (
              <li key={source.id}>
                <label className={`${selected ? "selected" : ""}${state.selectable ? "" : " unavailable"}`}>
                  <input
                    checked={selected}
                    disabled={!state.selectable && !selected}
                    onChange={() => toggleSource(source.id)}
                    type="checkbox"
                  />
                  <SourceIcon aria-hidden="true" size={18} />
                  <span>
                    <strong>{label}</strong>
                    <small>{source.description || source.typeLabel || getSourceTypeLabel(source)}</small>
                    {state.hint ? <small className="scenario-knowledge-source-hint">{state.hint}</small> : null}
                  </span>
                  {selected ? <Check aria-label="Выбран" className="scenario-knowledge-source-check" size={17} /> : null}
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </fieldset>
  );
}

function getSourceIcon(source) {
  const type = String(source?.type ?? source?.kind ?? "").toLowerCase();
  if (type.includes("url") || type.includes("link") || type.includes("web")) {
    return Link2;
  }
  if (type.includes("mcp") || type.includes("database") || type.includes("integration")) {
    return Database;
  }
  return FileText;
}

function getSourceTypeLabel(source) {
  const type = String(source?.type ?? source?.kind ?? "").toLowerCase();
  if (type.includes("url") || type.includes("link") || type.includes("web")) {
    return "Сайт или страница";
  }
  if (type.includes("mcp") || type.includes("database") || type.includes("integration")) {
    return "Подключённый источник";
  }
  return "Документ или статья";
}
