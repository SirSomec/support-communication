import React, { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Filter, Sparkles, Star } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { scoreAiSuggestionBatch, submitManualQaReview } from "../../app/qualityAiActions.js";
import { qualityService } from "../../services/qualityService.js";
import { ChannelBadge, MetricTile, ProductScreen, ScreenStateStrip, SectionTitle } from "../../ui.jsx";
import { AiQualityWorkspace } from "./AiQualityWorkspace.jsx";
import { KnowledgeBaseWorkspace } from "./KnowledgeBaseWorkspace.jsx";

const defaultAiSuggestionActions = ["accept", "edit", "reject"];

export function QualityScreen({ onBack, onToast, operator }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [qualityScores, setQualityScores] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiRealtimeChecks, setAiRealtimeChecks] = useState([]);
  const [aiCoachingQueue, setAiCoachingQueue] = useState([]);
  const [aiEffectivenessMetrics, setAiEffectivenessMetrics] = useState([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState([]);
  const [showLowScoresOnly, setShowLowScoresOnly] = useState(false);
  const [reviewingScoreId, setReviewingScoreId] = useState("");
  const [manualReviewIds, setManualReviewIds] = useState({});
  const [batchScoring, setBatchScoring] = useState(false);
  const [scoringSuggestionId, setScoringSuggestionId] = useState("");
  const [scoredSuggestions, setScoredSuggestions] = useState({});

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      setLoading(true);
      setError("");
      const response = await qualityService.fetchQualityWorkspace();
      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить качество.");
        setLoading(false);
        return;
      }

      const data = response.data ?? {};
      setQualityScores(Array.isArray(data.qualityScores) ? data.qualityScores : Array.isArray(data.qualityMetrics) ? data.qualityMetrics : []);
      setAiSuggestions(Array.isArray(data.aiSuggestions) ? data.aiSuggestions : []);
      setAiRealtimeChecks(Array.isArray(data.aiRealtimeChecks) ? data.aiRealtimeChecks : []);
      setAiCoachingQueue(Array.isArray(data.aiCoachingQueue) ? data.aiCoachingQueue : []);
      setAiEffectivenessMetrics(Array.isArray(data.aiEffectivenessMetrics) ? data.aiEffectivenessMetrics : []);
      setKnowledgeArticles(Array.isArray(data.knowledgeArticles) ? data.knowledgeArticles : []);
      setLoading(false);
    }

    void loadWorkspace();
    return () => {
      ignore = true;
    };
  }, []);

  const lowScores = qualityScores.filter((item) => Number(item.score) < 4 || String(item.status ?? "").includes("Низкая"));
  const visibleQualityScores = showLowScoresOnly ? lowScores : qualityScores;
  const averageCsat = qualityScores.length
    ? Math.round(
      qualityScores
        .filter((item) => item.scale === "CSAT")
        .reduce((sum, item, _, list) => sum + (Number(item.score) / 5) * 100 / list.length, 0)
    )
    : 0;

  async function handleManualQaReview(score) {
    if (reviewingScoreId) {
      return;
    }

    setReviewingScoreId(score.id);
    const result = await submitManualQaReview(score, {
      reviewer: resolveManualQaReviewer(operator)
    });
    setReviewingScoreId("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setManualReviewIds((current) => ({
      ...current,
      [score.id]: result.reviewId
    }));
    onToast(`Manual QA review saved: ${result.reviewId} ${result.auditId}`);
  }

  async function handleScoreAiSuggestions(suggestions = aiSuggestions) {
    if (batchScoring || scoringSuggestionId) {
      return;
    }

    setBatchScoring(true);
    const result = await scoreAiSuggestionBatch(suggestions);
    setBatchScoring(false);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const scoredAt = new Date().toISOString();
    setScoredSuggestions((current) => ({
      ...current,
      ...Object.fromEntries(suggestions.map((suggestion) => [suggestion.id, { auditId: result.auditId, score: result.score, scoredAt }]))
    }));
    onToast(`AI batch scoring saved: ${result.score}/100 ${result.auditId}`);
  }

  async function handleAiSuggestionAction(suggestion, action) {
    const actionId = `${suggestion.id}:${action}`;

    if (batchScoring || scoringSuggestionId) {
      return;
    }

    setScoringSuggestionId(actionId);
    const result = await scoreAiSuggestionBatch([{ ...suggestion, action }]);
    setScoringSuggestionId("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setScoredSuggestions((current) => ({
      ...current,
      [suggestion.id]: {
        action,
        auditId: result.auditId,
        score: result.score,
        scoredAt: new Date().toISOString()
      }
    }));
    onToast(`${action}: backend scoring saved ${result.score}/100 ${result.auditId}`);
  }

  if (loading) {
    return (
      <ProductScreen
        title="Качество, CSAT и AI"
        subtitle="Загрузка..."
        onBack={onBack}
        stateItems={createScreenStateItems({
          loading: "загружается...",
          total: 0,
          emptyWhenZero: "ожидание API",
          errorLabel: "ошибок нет"
        })}
      />
    );
  }

  if (error) {
    return (
      <ProductScreen
        title="Качество, CSAT и AI"
        subtitle="Ошибка загрузки"
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
      />
    );
  }

  return (
    <ProductScreen
      title="Качество, CSAT и AI"
      subtitle="Оценки клиентов, ручной QA, низкие оценки, AI-подсказки и управление статьями базы знаний."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: qualityScores.length + aiSuggestions.length + aiRealtimeChecks.length + aiCoachingQueue.length + knowledgeArticles.length,
        empty: `${qualityScores.length} оценок, ${aiSuggestions.length} AI, ${aiCoachingQueue.length} coaching`,
        emptyWhenZero: "качество без данных",
        errors: lowScores.length,
        errorLabel: "низких оценок нет"
      })}
      actions={
        <>
          <button
            aria-pressed={showLowScoresOnly}
            disabled={!lowScores.length}
            onClick={() => setShowLowScoresOnly((current) => !current)}
            title={lowScores.length ? "Показать очередь ручной QA по низким оценкам." : "Низких оценок нет."}
            type="button"
          >
            <Filter size={17} />
            Низкие оценки
          </button>
          <button
            className="primary-action"
            disabled={batchScoring || !aiSuggestions.length}
            onClick={() => void handleScoreAiSuggestions()}
            title={aiSuggestions.length ? "Отправить AI-подсказки на backend scoring." : "AI-подсказок для проверки нет."}
            type="button"
          >
            <Sparkles size={17} />
            {batchScoring ? "AI-проверка..." : "AI-проверка"}
          </button>
        </>
      }
    >
      {!qualityScores.length && !aiSuggestions.length && !knowledgeArticles.length ? (
        <ScreenStateStrip items={[{ label: "Quality", tone: "empty", value: "Нет данных качества для tenant" }]} />
      ) : null}

      <div className="metric-strip">
        <MetricTile icon={<Star size={21} />} label="CSAT" value={`${averageCsat}%`} detail="по закрытым диалогам" />
        <MetricTile icon={<AlertTriangle size={21} />} label="Низкие оценки" value={lowScores.length} detail="нужна проверка старшего" tone="danger" />
        <MetricTile icon={<Sparkles size={21} />} label="AI-подсказки" value={aiSuggestions.length} detail="accept / edit / reject" />
        <MetricTile icon={<BookOpen size={21} />} label="Статьи" value={knowledgeArticles.length} detail="рекомендации в чате" />
      </div>

      <div className="quality-layout">
        <section className="work-panel">
          <SectionTitle title="Оценки и ручной QA" action="после закрытия и выборочная проверка" />
          <div className="quality-list">
            {visibleQualityScores.map((score) => (
              <article className={`quality-row ${Number(score.score) < 4 ? "danger" : ""}`} key={score.id}>
                <header>
                  <strong>{score.client}</strong>
                  <ChannelBadge channel={score.channel} />
                  <b>{score.scale}: {score.score}</b>
                </header>
                <p>{score.comment}</p>
                <footer>
                  <span>{score.operator} · {score.topic}</span>
                  <button
                    disabled={reviewingScoreId === score.id || Boolean(manualReviewIds[score.id])}
                    onClick={() => void handleManualQaReview(score)}
                    title={manualReviewIds[score.id] ? `Backend review: ${manualReviewIds[score.id]}` : "Создать backend manual QA review."}
                    type="button"
                  >
                    {reviewingScoreId === score.id ? "Проверка..." : manualReviewIds[score.id] ? "Проверено" : "Проверить"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="AI-помощник оператора" action="контролируемые действия" />
          <div className="ai-suggestion-list">
            {aiSuggestions.map((suggestion) => (
              <article className="ai-suggestion" key={suggestion.id}>
                <header>
                  <Sparkles size={17} />
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.confidence}%</span>
                </header>
                <p>{suggestion.text}</p>
                <small>{suggestion.suggestedTopic} · {suggestion.risk}</small>
                {scoredSuggestions[suggestion.id] ? (
                  <small>{scoredSuggestions[suggestion.id].score}/100 · {scoredSuggestions[suggestion.id].auditId}</small>
                ) : null}
                <footer>
                  {getAiSuggestionActions(suggestion).map((action) => (
                    <button
                      disabled={scoringSuggestionId === `${suggestion.id}:${action}` || batchScoring}
                      key={action}
                      onClick={() => void handleAiSuggestionAction(suggestion, action)}
                      title="Отправить действие AI-подсказки на backend scoring."
                      type="button"
                    >
                      {scoringSuggestionId === `${suggestion.id}:${action}` ? "..." : action}
                    </button>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel">
        <SectionTitle title="AI real-time scoring" action="исправления до отправки и эффективность подсказок" />
        <AiQualityWorkspace
          coachingQueue={aiCoachingQueue}
          effectivenessMetrics={aiEffectivenessMetrics}
          onToast={onToast}
          realtimeChecks={aiRealtimeChecks}
        />
      </section>

      <section className="work-panel">
        <SectionTitle title="База знаний" action="редактор и публикация статей" />
        <KnowledgeBaseWorkspace articles={knowledgeArticles} onToast={onToast} operator={operator} />
      </section>
    </ProductScreen>
  );
}

function resolveManualQaReviewer(operator) {
  return String(operator?.id ?? operator?.email ?? operator?.name ?? "senior-qa").trim() || "senior-qa";
}

function getAiSuggestionActions(suggestion) {
  const actions = Array.isArray(suggestion?.actions)
    ? suggestion.actions.map((action) => String(action ?? "").trim()).filter(Boolean)
    : [];

  return actions.length ? actions : defaultAiSuggestionActions;
}
