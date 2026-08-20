import React from "react";
import { BookOpen, Database, ShieldCheck, X } from "lucide-react";
import { useModalA11y } from "../../../app/useModalA11y.js";
import { metricLabel } from "../model/reportMetricRegistry.js";

export function MetricGlossaryDrawer({ dataQuality, definitions, onClose, source, snapshotAt }) {
  const panelRef = useModalA11y(onClose);
  const sourceDiagnostics = source && typeof source === "object" ? source : {};
  return (
    <div className="reports-drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-label="Методика и качество данных" aria-modal="true" className="reports-drawer reports-evidence-drawer" ref={panelRef} role="dialog">
        <header>
          <div><BookOpen aria-hidden="true" size={20} /><span><strong>Методика и данные</strong><small>Определения, источники и ограничения снимка</small></span></div>
          <button aria-label="Закрыть методику" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <div className="reports-drawer-body">
          <section className="reports-evidence-summary">
            <h2><Database aria-hidden="true" size={17} />Текущий снимок</h2>
            <dl>
              <div><dt>Зафиксирован</dt><dd>{formatTimestamp(snapshotAt)}</dd></div>
              <div><dt>Строк источника</dt><dd>{known(sourceDiagnostics.rowCount)}</dd></div>
              <div><dt>С событиями жизненного цикла</dt><dd>{known(sourceDiagnostics.rowsWithLifecycleEvents)}</dd></div>
              <div><dt>С известным стартом</dt><dd>{known(sourceDiagnostics.conversationsWithKnownStart)}</dd></div>
              <div><dt>Некорректные оценки</dt><dd>{known(sourceDiagnostics.invalidRatings)}</dd></div>
            </dl>
            {dataQuality?.backfillBoundary ? <p className="reports-inline-warning">Исторические события до {formatTimestamp(dataQuality.backfillBoundary)} восстановлены не полностью.</p> : null}
          </section>
          <section className="reports-definition-list">
            <h2><ShieldCheck aria-hidden="true" size={17} />Определения метрик</h2>
            {(definitions ?? []).map((definition) => (
              <details key={definition.key}>
                <summary>{definition.label ?? metricLabel(null, definition.key)}</summary>
                <dl>
                  <div><dt>Формула</dt><dd>{definition.formula || "Описание источника без вычисляемой формулы"}</dd></div>
                  <div><dt>Источник</dt><dd>{Array.isArray(definition.source) ? definition.source.join(", ") : definition.source || "—"}</dd></div>
                  <div><dt>Единица</dt><dd>{definition.unit || "—"}</dd></div>
                </dl>
                {definition.caveats?.length ? <ul>{definition.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul> : null}
              </details>
            ))}
            {!definitions?.length ? <p className="reports-inline-empty">Каталог определений для этого снимка недоступен.</p> : null}
          </section>
        </div>
      </aside>
    </div>
  );
}

function formatTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "—";
}

function known(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat("ru-RU").format(Number(value)) : "—";
}
