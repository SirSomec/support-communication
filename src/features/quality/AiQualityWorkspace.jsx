import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Sparkles, TrendingUp } from "lucide-react";
import { scoreCoachingDraft } from "../../app/qualityAiActions.js";
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

export function AiQualityWorkspace({ aiConsent = false, coachingQueue, effectivenessMetrics, realtimeChecks, onToast }) {
  const [activeFilter, setActiveFilter] = useState("Все");
  const [scoringId, setScoringId] = useState("");
  const [scoredDrafts, setScoredDrafts] = useState({});
  const averageScore = getAverageScore(realtimeChecks);
  const filteredCoaching = useMemo(
    () => coachingQueue.filter((item) => activeFilter === "Все" || item.segment === activeFilter),
    [activeFilter, coachingQueue]
  );

  async function handleScoreCoachingDraft(item) {
    if (scoringId) {
      return;
    }

    setScoringId(item.id);
    const result = await scoreCoachingDraft(item, { aiConsent });
    setScoringId("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setScoredDrafts((current) => ({
      ...current,
      [item.id]: {
        auditId: result.auditId,
        checks: result.checks,
        score: result.score
      }
    }));
    onToast(`Проверка по правилам: ${item.trigger}, ${result.score}/100.`);
  }

  return (
    <div className="ai-quality-workspace">
      <section className="ai-live-score-card">
        <header>
          <Gauge size={18} />
          <strong>Проверка текста</strong>
          <StatusBadge tone={averageScore >= 80 ? "ok" : averageScore >= 60 ? "hold" : "warn"}>{averageScore}/100</StatusBadge>
        </header>
        <div className="ai-score-ring" style={{ "--score": `${averageScore}%` }}>
          <strong>{averageScore}</strong>
          <span>оценка правил</span>
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
          ariaLabel="Фильтр рекомендаций"
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
              {scoredDrafts[item.id] ? (
                <small className="ai-coaching-score">
                  {scoredDrafts[item.id].score}/100 · {scoredDrafts[item.id].auditId}
                </small>
              ) : null}
              <footer>
                <StatusBadge tone={stateTone[item.severity] ?? "info"}>{item.trigger}</StatusBadge>
                <button disabled={scoringId === item.id} onClick={() => void handleScoreCoachingDraft(item)} type="button">
                  {scoringId === item.id ? "Оценка..." : "Проверить черновик"}
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
