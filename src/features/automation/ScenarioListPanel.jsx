import React from "react";
import { AlertTriangle, Bot, MoreHorizontal, Trash2, Undo2 } from "lucide-react";
import { ChannelList, StatusBadge } from "../../ui.jsx";
import { buildScenarioListRow } from "./automationModel.js";

export function ScenarioListPanel({
  aiReadiness,
  canManage,
  isSaving,
  knowledgeSources,
  knowledgeSourcesError,
  knowledgeSourcesLoading,
  onArchive,
  onDisable,
  onOpen,
  onRestore,
  onRetry,
  partial,
  scenarios,
  selectedScenarioId,
  versions,
  workspaceError
}) {
  const rows = scenarios.map((scenario) => buildScenarioListRow(scenario, {
    aiReadiness,
    knowledgeSources,
    versions
  }));

  return (
    <section className="work-panel scenario-list-panel" aria-label="Список сценариев ботов">
      <header className="scenario-list-panel__header">
        <div>
          <strong>Сценарии</strong>
          <span>Название, статус, каналы, триггер, AI и публикация</span>
        </div>
        <StatusBadge tone={partial || knowledgeSourcesError ? "warn" : "info"}>
          {rows.length ? `${rows.length} шт.` : "пусто"}
        </StatusBadge>
      </header>

      {workspaceError ? (
        <div className="scenario-list-state scenario-list-state--error" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Не удалось обновить список</strong>
            <span>{workspaceError}</span>
          </div>
          {onRetry ? <button onClick={onRetry} type="button">Повторить</button> : null}
        </div>
      ) : null}

      {partial || knowledgeSourcesError || knowledgeSourcesLoading ? (
        <div className={`scenario-list-state ${knowledgeSourcesError ? "scenario-list-state--warn" : "scenario-list-state--info"}`} role="status">
          <AlertTriangle size={18} />
          <span>
            {knowledgeSourcesLoading
              ? "Источники знаний ещё загружаются — часть данных AI может быть неполной."
              : knowledgeSourcesError
                ? `Частичные данные: ${knowledgeSourcesError}`
                : "Workspace загружен частично — часть метрик или readiness может быть устаревшей."}
          </span>
        </div>
      ) : null}

      {!rows.length && !workspaceError ? (
        <div className="entity-empty scenario-list-empty">
          <Bot size={22} />
          <strong>Сценариев пока нет</strong>
          <span>Создайте первый сценарий в мастере: он сохранится как черновик, его можно проверить и опубликовать.</span>
        </div>
      ) : null}

      {rows.length ? (
        <div className="scenario-list">
          {rows.map((row) => {
            const scenario = scenarios.find((item) => item.id === row.id);
            const selected = selectedScenarioId === row.id;
            return (
              <article className={`scenario-card scenario-card--list ${selected ? "selected" : ""}`} key={row.id}>
                <header>
                  <Bot size={18} aria-hidden="true" />
                  <strong>{row.name}</strong>
                  <StatusBadge tone={row.statusTone}>{row.statusLabel}</StatusBadge>
                </header>

                <dl className="scenario-card-meta">
                  <div>
                    <dt>Триггер</dt>
                    <dd>{row.triggerSummary}</dd>
                  </div>
                  <div>
                    <dt>AI / источники</dt>
                    <dd>{row.aiSummary}</dd>
                  </div>
                  <div>
                    <dt>Последняя публикация</dt>
                    <dd>{row.lastPublishedLabel}</dd>
                  </div>
                </dl>

                {row.hasErrors ? (
                  <ul className="scenario-card-errors">
                    {row.errors.map((error) => (
                      <li key={error}><AlertTriangle size={14} aria-hidden="true" /> {error}</li>
                    ))}
                  </ul>
                ) : null}

                <footer>
                  <ChannelList channels={row.channels} />
                  <div className="scenario-card-actions" aria-label={`Действия для ${row.name}`}>
                    <MoreHorizontal size={15} aria-hidden="true" />
                    <button onClick={() => onOpen?.(scenario)} type="button">Открыть</button>
                    {canManage && row.status === "published" ? (
                      <button disabled={isSaving} onClick={() => onDisable?.(scenario)} type="button">Остановить</button>
                    ) : null}
                    {canManage && row.status === "archived" ? (
                      <button disabled={isSaving} onClick={() => onRestore?.(scenario)} type="button">
                        <Undo2 size={15} /> Восстановить
                      </button>
                    ) : null}
                    {canManage && row.status !== "archived" ? (
                      <button className="scenario-delete-button" disabled={isSaving} onClick={() => onArchive?.(scenario)} type="button">
                        <Trash2 size={15} /> Удалить
                      </button>
                    ) : null}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
