import React from "react";
import { ArrowRight, CircleCheck, Lightbulb, TriangleAlert } from "lucide-react";
import { formatCompactNumber, formatNumber, formatReportMetric } from "../model/reportMetricRegistry.js";

const COPY = {
  backlog_growth: { title: "Бэклог растёт", action: "Проверьте входящий поток и доступную ёмкость команды." },
  csat_risk: { title: "Риск по CSAT", action: "Разберите низкие оценки и повторяющиеся причины." },
  first_response_degradation: { title: "Первый ответ замедлился", action: "Проверьте пики нагрузки и маршрутизацию." },
  first_response_low_coverage: { title: "Низкое покрытие первого ответа", action: "Уточните полноту событий сообщений до оценки скорости." },
  sla_breaches: { title: "Есть нарушения SLA", action: "Начните с старых ожидающих обращений." },
  workload_imbalance: { title: "Нагрузка распределена неравномерно", action: "Сверьте назначения и передачи между операторами." }
};

export function InsightsRail({ insights, metrics }) {
  const rows = Array.isArray(insights) ? insights.slice(0, 5) : [];
  return (
    <aside aria-labelledby="reports-insights-title" className="reports-panel reports-insights-rail">
      <header className="reports-panel-heading">
        <span className="reports-panel-icon is-violet"><Lightbulb aria-hidden="true" size={18} /></span>
        <span><h2 id="reports-insights-title">Требует внимания</h2><p>Сигналы только из измеренных данных</p></span>
      </header>
      {rows.length ? <div className="reports-insight-list">{rows.map((insight, index) => {
        const copy = COPY[insight.code] ?? {};
        const tone = insight.severity ?? insight.tone ?? "info";
        const Icon = tone === "critical" || tone === "warning" ? TriangleAlert : CircleCheck;
        return (
          <article className={`is-${tone}`} key={insight.id ?? insight.code ?? index}>
            <Icon aria-hidden="true" size={17} />
            <div>
              <strong>{insight.title ?? copy.title ?? "Изменение показателя"}</strong>
              <p>{insight.detail ?? insight.description ?? insightEvidence(insight, metrics)}</p>
              <small>{insight.action ?? copy.action ?? "Откройте соответствующий разрез для проверки."}</small>
            </div>
          </article>
        );
      })}</div> : (
        <div className="reports-insights-empty">
          <CircleCheck aria-hidden="true" size={22} />
          <strong>Критических сигналов нет</strong>
          <p>Автоматические выводы появятся только при достаточном объёме фактов.</p>
        </div>
      )}
      <a className="reports-insights-link" href="#reports-breakdowns">Перейти к разрезам <ArrowRight aria-hidden="true" size={15} /></a>
    </aside>
  );
}

function insightEvidence(insight, metrics) {
  const metric = metrics?.[insight.metric];
  const current = Number.isFinite(Number(insight.current))
    ? insight.metric === "operatorWorkload" ? formatCompactNumber(Number(insight.current)) : formatReportMetric({ ...metric, value: insight.current }, insight.metric)
    : "—";
  const change = Number.isFinite(Number(insight.changePercent)) ? `, изменение ${signed(Number(insight.changePercent))}%` : "";
  return `Текущее значение: ${current}${change}. Основание: n = ${formatCompactNumber(Number(insight.sampleSize ?? 0))}.`;
}

function signed(value) {
  const formatted = formatNumber(Math.abs(value), 1);
  return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
}
