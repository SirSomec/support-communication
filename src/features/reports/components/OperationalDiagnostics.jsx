import React from "react";
import { Activity, Clock3, MessageSquare, ShieldCheck } from "lucide-react";
import { formatCompactNumber, formatReportMetric, metricLabel } from "../model/reportMetricRegistry.js";
import { ReportInfoTooltip } from "./ReportInfoTooltip.jsx";

const DIAGNOSTIC_GROUPS = [
  {
    icon: Activity,
    key: "flow",
    metrics: ["flowRatio", "waiting", "overdue"],
    subtitle: "Баланс спроса и открытой работы",
    title: "Поток и очередь"
  },
  {
    icon: ShieldCheck,
    key: "coverage",
    metrics: ["responseCoverage", "csatCoverage", "oneTouchRate"],
    subtitle: "Покрытие измерений и устойчивость решения",
    title: "Покрытие и качество"
  },
  {
    icon: MessageSquare,
    key: "conversation",
    metrics: ["nextResponseMedianSeconds", "nextResponseP90Seconds", "internalComments"],
    subtitle: "Продолжение диалога после первого ответа",
    title: "Работа в диалоге"
  }
];

export function OperationalDiagnostics({ definitions, metrics }) {
  const definitionMap = new Map((definitions ?? []).map((definition) => [definition.key, definition]));

  return (
    <section
      aria-labelledby="reports-operational-diagnostics-title"
      className="reports-panel reports-operational-diagnostics"
      data-testid="reports-operational-diagnostics"
    >
      <header className="reports-panel-heading">
        <span className="reports-panel-icon is-violet"><Clock3 aria-hidden="true" size={18} /></span>
        <span>
          <h2 id="reports-operational-diagnostics-title">Операционная диагностика</h2>
          <p>Вторичные метрики с явным основанием расчёта</p>
        </span>
      </header>
      <div className="reports-diagnostic-groups">
        {DIAGNOSTIC_GROUPS.map((group) => {
          const Icon = group.icon;
          return (
            <article className="reports-diagnostic-group" key={group.key}>
              <header>
                <Icon aria-hidden="true" size={16} />
                <span><strong>{group.title}</strong><small>{group.subtitle}</small></span>
              </header>
              <dl>
                {group.metrics.map((key) => {
                  const metric = metrics?.[key] ?? { key, value: null };
                  const definition = definitionMap.get(key);
                  const unavailable = metric.value === null || metric.value === undefined || !Number.isFinite(Number(metric.value));
                  return (
                    <div className={`reports-diagnostic-metric ${unavailable ? "is-unavailable" : ""}`} data-metric-key={key} key={key}>
                      <dt>
                        <span>{metricLabel(metric, key)}</span>
                        {definition ? <ReportInfoTooltip caveats={definition.caveats} className="reports-diagnostic-definition" description={definition.formula} sources={definition.source} title={metricLabel(metric, key)} /> : null}
                      </dt>
                      <dd>
                        <strong>{formatReportMetric(metric, key)}</strong>
                        <small>{diagnosticEvidence(key, metric, metrics)}</small>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function diagnosticEvidence(key, metric, metrics) {
  const value = finite(metric?.value);
  if (value === null) return metric?.unavailableReason || "Недостаточно данных";

  const numerator = finite(metric?.numerator);
  const denominator = finite(metric?.denominator);
  if (numerator !== null && denominator !== null) {
    return `${formatCompactNumber(numerator)} из ${formatCompactNumber(denominator)} обращений`;
  }

  if (key === "flowRatio") {
    const incoming = finite(metrics?.incoming?.value);
    const resolved = finite(metrics?.resolved?.value);
    return incoming !== null && resolved !== null
      ? `${formatCompactNumber(resolved)} решено из ${formatCompactNumber(incoming)} входящих`
      : "Отношение решённых к входящим";
  }

  if (key === "overdue") {
    const recorded = finite(metrics?.slaAttainment?.denominator ?? metrics?.slaAttainment?.sampleSize);
    return recorded === null
      ? "Только явно записанные нарушения"
      : `${formatCompactNumber(value)} из ${formatCompactNumber(recorded)} с записанным SLA`;
  }

  const sampleSize = finite(metric?.sampleSize);
  if (sampleSize !== null) return `Выборка: n = ${formatCompactNumber(sampleSize)}`;
  if (key === "waiting") return "На конец выбранного периода";
  if (key === "internalComments") return "Записанные внутренние сообщения";
  return "По выбранному периоду";
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
