import React from "react";
import { Activity, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { formatDurationSeconds, formatNumber } from "../model/reportMetricRegistry.js";

export function ServiceLevelPanel({ serviceLevel }) {
  const sla = serviceLevel?.sla ?? {};
  const value = finiteOrNull(sla.value);
  const gaugeValue = Math.max(0, Math.min(100, value ?? 0));
  const firstResponse = serviceLevel?.firstResponse ?? {};
  const resolution = serviceLevel?.resolution ?? {};

  return (
    <section aria-labelledby="reports-service-title" className="reports-panel reports-service-panel">
      <header className="reports-panel-heading">
        <span className="reports-panel-icon is-blue"><Activity aria-hidden="true" size={18} /></span>
        <span><h2 id="reports-service-title">Уровень сервиса</h2><p>Записанный SLA и распределение времени, без подмены средним</p></span>
      </header>
      <div className="reports-service-content">
        <div className="reports-sla-gauge-wrap">
          <div
            aria-label={value === null ? "SLA не измерен" : `SLA без нарушения ${formatNumber(value, 1)} процентов`}
            className={`reports-sla-gauge ${value === null ? "is-unavailable" : ""}`}
            role="img"
            style={{ "--reports-gauge-value": `${gaugeValue * 3.6}deg` }}
          >
            <span><strong>{value === null ? "—" : `${formatNumber(value, 1)}%`}</strong><small>без нарушения</small></span>
          </div>
          <div className="reports-sla-counts">
            <span><CheckCircle2 aria-hidden="true" size={15} />Выполнено <strong>{knownDifference(sla.denominator, sla.breaches)}</strong></span>
            <span><ShieldAlert aria-hidden="true" size={15} />Нарушено <strong>{formatKnown(sla.breaches)}</strong></span>
            <small>Основание: {formatKnown(sla.denominator)} обращений с записанным SLA</small>
          </div>
        </div>
        <div className="reports-quantile-grid">
          <QuantileBlock
            coverage={firstResponse.coverage}
            icon={<Clock3 aria-hidden="true" size={17} />}
            label="Первый ответ"
            median={firstResponse.median}
            p90={firstResponse.p90}
            sampleSize={firstResponse.sampleSize}
          />
          <QuantileBlock
            icon={<CheckCircle2 aria-hidden="true" size={17} />}
            label="Первое решение"
            median={resolution.median}
            p90={resolution.p90}
            sampleSize={resolution.sampleSize}
          />
        </div>
      </div>
    </section>
  );
}

function QuantileBlock({ coverage, icon, label, median, p90, sampleSize }) {
  const available = finiteOrNull(median) !== null || finiteOrNull(p90) !== null;
  return (
    <article className="reports-quantile-block">
      <header>{icon}<strong>{label}</strong></header>
      <dl>
        <div><dt>P50</dt><dd>{formatMaybeDuration(median)}</dd></div>
        <div><dt>P90</dt><dd>{formatMaybeDuration(p90)}</dd></div>
      </dl>
      <small>{available ? `n = ${formatKnown(sampleSize)}` : "Недостаточно событий для расчёта"}</small>
      {finiteOrNull(coverage) !== null ? <small>Покрытие: {formatNumber(Number(coverage), 1)}%</small> : null}
    </article>
  );
}

function formatMaybeDuration(value) {
  return finiteOrNull(value) === null ? "—" : formatDurationSeconds(Number(value));
}

function formatKnown(value) {
  return finiteOrNull(value) === null ? "—" : new Intl.NumberFormat("ru-RU").format(Number(value));
}

function knownDifference(total, part) {
  if (finiteOrNull(total) === null || finiteOrNull(part) === null) return "—";
  return formatKnown(Math.max(0, Number(total) - Number(part)));
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
