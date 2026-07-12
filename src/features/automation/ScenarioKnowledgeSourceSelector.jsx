import React, { useMemo } from "react";
import { AlertCircle, BookOpenCheck, Check, Database, FileText, Link2 } from "lucide-react";

const EMPTY_SOURCES = [];
const readyStatuses = new Set(["ready", "indexed", "published", "active", "готов", "готово", "опубликован"]);

/**
 * Controlled selector for knowledge sources that are safe to use in a bot scenario.
 * Data loading deliberately stays outside of this component so it can be used in the
 * creation wizard, scenario settings, and a future source catalogue without API coupling.
 */
export function ScenarioKnowledgeSourceSelector({
  disabled = false,
  emptyMessage = "Добавьте и подготовьте источник знаний, чтобы бот мог отвечать по нему.",
  error = "",
  id = "scenario-knowledge-sources",
  isLoading = false,
  onSelectedSourceIdsChange,
  selectedSourceIds = EMPTY_SOURCES,
  sources = EMPTY_SOURCES
}) {
  const selectedIds = useMemo(() => new Set(selectedSourceIds), [selectedSourceIds]);
  const readySources = useMemo(
    () => sources.filter((source) => isReadySource(source)),
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
      <p id={`${id}-help`}>Выберите только готовые источники. Бот будет искать ответ в них и укажет, когда информации недостаточно.</p>

      {isLoading ? <div className="scenario-knowledge-source-state" role="status">Проверяем доступные источники…</div> : null}

      {!isLoading && error ? (
        <div className="scenario-knowledge-source-state error" role="alert">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      {!isLoading && !error && readySources.length === 0 ? (
        <div className="scenario-knowledge-source-state empty">
          <BookOpenCheck aria-hidden="true" size={18} />
          <span>{emptyMessage}</span>
        </div>
      ) : null}

      {!isLoading && !error && readySources.length > 0 ? (
        <ul aria-label="Готовые источники знаний" className="scenario-knowledge-source-list">
          {readySources.map((source) => {
            const selected = selectedIds.has(source.id);
            const SourceIcon = getSourceIcon(source);
            const label = source.title || source.name || "Источник без названия";

            return (
              <li key={source.id}>
                <label className={selected ? "selected" : ""}>
                  <input
                    checked={selected}
                    onChange={() => toggleSource(source.id)}
                    type="checkbox"
                  />
                  <SourceIcon aria-hidden="true" size={18} />
                  <span>
                    <strong>{label}</strong>
                    <small>{source.description || source.typeLabel || getSourceTypeLabel(source)}</small>
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

function isReadySource(source) {
  if (source?.isReady === true) {
    return true;
  }

  return readyStatuses.has(String(source?.status ?? "").trim().toLowerCase());
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
