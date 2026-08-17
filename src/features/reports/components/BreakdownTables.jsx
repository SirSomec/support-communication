import React, { useMemo, useState } from "react";
import { ArrowDownUp, Headphones, Layers3 } from "lucide-react";
import { mergeReportOperatorRows } from "../model/reportBreakdownModel.js";
import { formatCompactNumber, formatDurationSeconds, formatNumber } from "../model/reportMetricRegistry.js";

const MIX_VIEWS = [
  { key: "channels", label: "Каналы" },
  { key: "topics", label: "Тематики" }
];
const EMPTY_ROWS = Object.freeze([]);

export function BreakdownTables({ breakdowns, operatorId, routing }) {
  const [mixView, setMixView] = useState("channels");
  const mixRows = useMemo(() => rankedRows(breakdowns?.[mixView]), [breakdowns, mixView]);
  const routingRows = routing?.matchesQuery ? (routing.rows ?? EMPTY_ROWS) : EMPTY_ROWS;
  const operators = useMemo(
    () => mergeReportOperatorRows(breakdowns?.operators, routingRows, {
      selectedOperatorId: operatorId
    }),
    [breakdowns?.operators, operatorId, routingRows]
  );

  return (
    <section className="reports-breakdowns" id="reports-breakdowns">
      <article className="reports-panel reports-mix-panel">
        <header className="reports-panel-heading reports-panel-heading-with-tabs">
          <span className="reports-panel-icon is-blue"><Layers3 aria-hidden="true" size={18} /></span>
          <span><h2>Структура потока</h2><p>Где формируются обращения и бэклог</p></span>
          <div aria-label="Разрез потока" className="reports-mini-tabs" role="tablist">
            {MIX_VIEWS.map((item) => <button aria-selected={mixView === item.key} key={item.key} onClick={() => setMixView(item.key)} role="tab" type="button">{item.label}</button>)}
          </div>
        </header>
        <div className="reports-table-scroll">
          <table className="reports-data-table">
            <caption className="sr-only">Разрез обращений по {mixView === "channels" ? "каналам" : "тематикам"}</caption>
            <thead><tr><th scope="col">{mixView === "channels" ? "Канал" : "Тематика"}</th><th scope="col">Входящие</th><th scope="col">Решено</th><th scope="col">Бэклог</th><th scope="col">Доля</th></tr></thead>
            <tbody>{mixRows.map((row) => (
              <tr key={row.id}>
                <th scope="row"><span className="reports-rank-label"><i style={{ width: `${row.relative}%` }} />{row.label}</span></th>
                <td>{formatCompactNumber(row.incoming)}</td>
                <td>{formatCompactNumber(row.resolved)}</td>
                <td>{formatCompactNumber(row.backlog)}</td>
                <td>{Number.isFinite(row.share) ? `${formatNumber(row.share, 1)}%` : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!mixRows.length ? <div className="reports-inline-empty">Для этого разреза пока нет измеренных данных.</div> : null}
        </div>
      </article>

      <article className="reports-panel reports-operator-panel" data-testid="routing-activity-report">
        <header className="reports-panel-heading">
          <span className="reports-panel-icon is-teal"><Headphones aria-hidden="true" size={18} /></span>
          <span><h2>Нагрузка команды</h2><p>Назначения, открытая работа и передачи — не рейтинг качества</p></span>
          {routing?.loading ? <span className="reports-subtle-status">Обновляем…</span> : null}
        </header>
        {routing?.error ? <p className="reports-inline-warning">Назначения и передачи временно недоступны: {routing.error}</p> : null}
        <div className="reports-table-scroll">
          <table className="reports-data-table reports-operator-table">
            <caption className="sr-only">Операционная нагрузка команды</caption>
            <thead><tr><th scope="col">Оператор</th><th scope="col">Открыто</th><th scope="col">Решено</th><th scope="col">Касания</th><th scope="col">Первый ответ · P50</th><th scope="col"><ArrowDownUp aria-hidden="true" size={14} /> Передачи</th></tr></thead>
            <tbody>{operators.map((row) => (
              <tr key={row.id}>
                <th scope="row"><span className="reports-avatar" aria-hidden="true">{initials(row.label)}</span>{row.label}</th>
                <td>{formatCompactNumber(row.backlog)}</td>
                <td>{formatCompactNumber(row.resolved)}</td>
                <td>{formatCompactNumber(row.touches)}</td>
                <td>{Number.isFinite(row.firstResponse) ? formatDurationSeconds(row.firstResponse) : "—"}</td>
                <td>{Number.isFinite(row.transfers) ? formatCompactNumber(row.transfers) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
          {!operators.length ? <div className="reports-inline-empty">Нет данных об операторской нагрузке за выбранный период.</div> : null}
        </div>
      </article>
    </section>
  );
}

function rankedRows(values) {
  const rows = (Array.isArray(values) ? values : []).map((row, index) => ({
    backlog: number(row.backlog),
    id: String(row.id ?? row.key ?? index),
    incoming: number(row.incoming ?? row.value),
    label: String(row.label ?? row.key ?? "—"),
    resolved: number(row.resolved),
    share: finite(row.sharePercent)
  })).sort((a, b) => b.incoming - a.incoming || a.label.localeCompare(b.label, "ru"));
  const maximum = Math.max(1, ...rows.map((row) => row.incoming));
  return rows.map((row) => ({ ...row, relative: row.incoming / maximum * 100 }));
}

function initials(value) {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function finite(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
}
