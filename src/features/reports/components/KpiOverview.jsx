import React from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { formatMetricDelta, formatReportMetric, metricLabel, metricTone } from "../model/reportMetricRegistry.js";
import { HERO_METRIC_KEYS } from "../model/reportWorkspaceModel.js";

export function KpiOverview({ compare, definitions, metrics }) {
  const definitionMap = new Map((definitions ?? []).map((definition) => [definition.key, definition]));
  const items = HERO_METRIC_KEYS.map((key) => metrics[key] ?? { key, value: null });
  return (
    <section aria-label="Ключевые показатели" className="reports-kpi-rail">
      {items.map((metric) => {
        const tone = compare ? metricTone(metric) : "neutral";
        const definition = definitionMap.get(metric.key);
        const DeltaIcon = Number(metric.delta) > 0 ? ArrowUpRight : Number(metric.delta) < 0 ? ArrowDownRight : null;
        return (
          <article className={`reports-kpi-card is-${tone} ${metric.value === null || metric.value === undefined ? "is-unavailable" : ""}`} key={metric.key}>
            <header>
              <span>{metricLabel(metric, metric.key)}</span>
              {definition ? <button aria-label={`Определение: ${metricLabel(metric, metric.key)}`} title={`${definition.formula ?? ""}${definition.source ? ` · Источник: ${definition.source}` : ""}`} type="button"><Info size={14} /></button> : null}
            </header>
            <strong>{formatReportMetric(metric, metric.key)}</strong>
            <div>
              {compare && metric.delta !== null && metric.delta !== undefined && DeltaIcon ? <DeltaIcon aria-hidden="true" size={14} /> : null}
              <span>{compare ? formatMetricDelta(metric) : "Сравнение выключено"}</span>
            </div>
            <small>{metric.value === null || metric.value === undefined ? metric.unavailableReason || "Недостаточно измеренных событий" : metric.sampleSize !== null && metric.sampleSize !== undefined ? `n = ${metric.sampleSize}` : metric.denominator !== null && metric.denominator !== undefined ? `Основание: ${metric.denominator}` : "По выбранному периоду"}</small>
          </article>
        );
      })}
    </section>
  );
}
