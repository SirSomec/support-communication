import React from "react";
import { Archive, CircleAlert } from "lucide-react";
import { formatCompactNumber } from "../model/reportMetricRegistry.js";

const AGE_LABELS = {
  under_4h: "До 4 часов",
  "4h_24h": "4–24 часа",
  "1d_3d": "1–3 дня",
  "3d_7d": "3–7 дней",
  "7d_30d": "7–30 дней",
  over_30d: "Более 30 дней"
};

export function QueueHealthPanel({ ageBuckets, metrics }) {
  const rows = Array.isArray(ageBuckets) ? ageBuckets : [];
  const maximum = Math.max(1, ...rows.map((row) => Number(row.count ?? row.value ?? 0)).filter(Number.isFinite));
  const bucketTotal = rows.reduce((sum, row) => sum + (Number(row.count ?? row.value) || 0), 0);
  const backlog = metrics?.backlog?.value;
  const reconciles = Number.isFinite(Number(backlog)) && Number(backlog) === bucketTotal;

  return (
    <section aria-labelledby="reports-queue-title" className="reports-panel reports-queue-panel">
      <header className="reports-panel-heading">
        <span className="reports-panel-icon is-amber"><Archive aria-hidden="true" size={18} /></span>
        <span><h2 id="reports-queue-title">Здоровье очереди</h2><p>Возраст открытого бэклога на конец периода</p></span>
        <strong className="reports-panel-total">{formatCompactNumber(Number(backlog ?? bucketTotal))}</strong>
      </header>
      {rows.length ? (
        <div className="reports-age-list">
          {rows.map((row) => {
            const count = Number(row.count ?? row.value) || 0;
            const share = Number.isFinite(Number(row.sharePercent))
              ? Number(row.sharePercent)
              : bucketTotal > 0 ? count / bucketTotal * 100 : 0;
            return (
              <div className="reports-age-row" key={row.key ?? row.id}>
                <span>{AGE_LABELS[row.key] ?? row.label ?? row.key}</span>
                <div aria-hidden="true"><i style={{ width: `${count / maximum * 100}%` }} /></div>
                <strong>{formatCompactNumber(count)}</strong>
                <small>{share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</small>
              </div>
            );
          })}
        </div>
      ) : <div className="reports-inline-empty">Открытого бэклога нет или возраст обращений недоступен.</div>}
      <footer className={reconciles || !Number.isFinite(Number(backlog)) ? "is-ok" : "is-warning"}>
        {reconciles || !Number.isFinite(Number(backlog)) ? null : <CircleAlert aria-hidden="true" size={14} />}
        {Number.isFinite(Number(backlog)) ? `Сумма возрастных групп: ${formatCompactNumber(bucketTotal)} из ${formatCompactNumber(Number(backlog))}` : "Сверка с общим бэклогом недоступна"}
      </footer>
    </section>
  );
}
