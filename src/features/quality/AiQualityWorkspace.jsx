import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Sparkles, TrendingUp } from "lucide-react";
import { ChannelBadge, SegmentedControl, StatusBadge } from "../../ui.jsx";
import "./ai-quality.css";

const coachingFilters = ["Все", "Риски", "SLA", "База знаний"];
const stateTone = {
  ok: "ok",
  warn: "hold",
  danger: "warn"
};

function getAverageScore(checks) {
  if (!checks.length) {
    return 0;
  }

  return Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
}

export function AiQualityWorkspace({ coachingQueue, effectivenessMetrics, realtimeChecks, onToast }) {
  const [activeFilter, setActiveFilter] = useState("Все");
  const averageScore = getAverageScore(realtimeChecks);
  const filteredCoaching = useMemo(
    () => coachingQueue.filter((item) => activeFilter === "Все" || item.segment === activeFilter),
    [activeFilter, coachingQueue]
  );

  return (
    <div className="ai-quality-workspace">
      <section className="ai-live-score-card">
        <header>
          <Gauge size={18} />
          <strong>Real-time scoring</strong>
          <StatusBadge tone={averageScore >= 80 ? "ok" : averageScore >= 60 ? "hold" : "warn"}>{averageScore}/100</StatusBadge>
        </header>
        <div className="ai-score-ring" style={{ "--score": `${averageScore}%` }}>
          <strong>{averageScore}</strong>
          <span>live score</span>
        </div>
        <div className="ai-signal-list">
          {realtimeChecks.map((check) => (
            <article className={`ai-signal-row ${check.state}`} key={check.id}>
              <div>
                {check.state === "danger" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                <strong>{check.label}</strong>
              </div>
              <span>{check.score}/100</span>
              <p>{check.detail}</p>
              <small>{check.correction}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="ai-coaching-panel">
        <header>
          <Sparkles size={18} />
          <strong>Подсказки исправления</strong>
          <span>{filteredCoaching.length} активны</span>
        </header>
        <SegmentedControl
          ariaLabel="Фильтр AI coaching"
          className="ai-coaching-filters"
          onChange={setActiveFilter}
          options={coachingFilters}
          value={activeFilter}
        />
        <div className="ai-coaching-list">
          {filteredCoaching.map((item) => (
            <article className={`ai-coaching-card ${item.severity}`} key={item.id}>
              <header>
                <div>
                  <strong>{item.client}</strong>
                  <span>{item.topic}</span>
                </div>
                <ChannelBadge channel={item.channel} />
              </header>
              <p>{item.recommendation}</p>
              <blockquote>{item.draft}</blockquote>
              <footer>
                <StatusBadge tone={stateTone[item.severity] ?? "info"}>{item.trigger}</StatusBadge>
                <button onClick={() => onToast(`AI coaching: ${item.trigger}`)} type="button">
                  Применить исправление
                </button>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="ai-effectiveness-panel">
        <header>
          <TrendingUp size={18} />
          <strong>Эффективность подсказок</strong>
          <span>7 дней</span>
        </header>
        <div className="ai-effectiveness-grid">
          {effectivenessMetrics.map((metric) => (
            <article className="ai-effectiveness-card" key={metric.id}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <b>{metric.delta}</b>
              <small>{metric.detail}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
