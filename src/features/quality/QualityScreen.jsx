import React, { useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, Filter, ShieldCheck, Sparkles, Star } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { scoreAiSuggestionBatch, submitManualQaReview } from "../../app/qualityAiActions.js";
import { qualityService } from "../../services/qualityService.js";
import { ChannelBadge, MetricTile, ProductScreen, ScreenStateStrip, SectionTitle } from "../../ui.jsx";
import { AiQualityWorkspace } from "./AiQualityWorkspace.jsx";
import { KnowledgeBaseWorkspace } from "./KnowledgeBaseWorkspace.jsx";

export function QualityScreen({ access, onBack, onToast, operator }) {
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
  const [reviewDraft, setReviewDraft] = useState(null);
  const [manualReviewIds, setManualReviewIds] = useState({});
  const [batchScoring, setBatchScoring] = useState(false);
  const [scoredSuggestions, setScoredSuggestions] = useState({});
  const [capabilities, setCapabilities] = useState({ aiProviderConnected: false, scoringMode: "rules" });
  const [aiConsent, setAiConsent] = useState(false);

  function applyWorkspace(data = {}) {
    const loadedQualityScores = Array.isArray(data.qualityScores) ? data.qualityScores : Array.isArray(data.qualityMetrics) ? data.qualityMetrics : [];
    setQualityScores(loadedQualityScores);
    setManualReviewIds(Object.fromEntries(
      loadedQualityScores
        .filter((score) => score?.id && score?.manualReviewId)
        .map((score) => [score.id, score.manualReviewId])
    ));
    setAiSuggestions(Array.isArray(data.aiSuggestions) ? data.aiSuggestions : []);
    setAiRealtimeChecks(Array.isArray(data.aiRealtimeChecks) ? data.aiRealtimeChecks : []);
    setAiCoachingQueue(Array.isArray(data.aiCoachingQueue) ? data.aiCoachingQueue : []);
    setAiEffectivenessMetrics(Array.isArray(data.aiEffectivenessMetrics) ? data.aiEffectivenessMetrics : []);
    setKnowledgeArticles(Array.isArray(data.knowledgeArticles) ? data.knowledgeArticles : []);
    setCapabilities({
      aiProviderConnected: Boolean(data.capabilities?.aiProviderConnected),
      scoringMode: data.capabilities?.scoringMode ?? "rules"
    });
  }

  async function refreshWorkspace() {
    const response = await qualityService.fetchQualityWorkspace();
    if (response.status === "ok") {
      applyWorkspace(response.data);
    }
    return response;
  }

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

      applyWorkspace(response.data);
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
      criteria: reviewDraft.criteria,
      reviewScore: calculateQaScore(reviewDraft.criteria),
      reviewer: resolveManualQaReviewer(operator)
    });
    setReviewingScoreId("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    await refreshWorkspace();
    setReviewDraft(null);
    onToast(`Ручная проверка сохранена: ${result.reviewId}.`);
  }

  async function handleScoreAiSuggestions(suggestions = aiSuggestions) {
    if (batchScoring) {
      return;
    }

    setBatchScoring(true);
    const result = await scoreAiSuggestionBatch(suggestions, { aiConsent });
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
    await refreshWorkspace();
    onToast(`Проверка по правилам сохранена: ${result.score}/100.`);
  }

  if (loading) {
    return (
      <ProductScreen
        title="Качество и CSAT"
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
        title="Качество и CSAT"
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
      title="Качество и CSAT"
      subtitle="Оценки клиентов, ручные проверки, локальная проверка текста и база знаний."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: qualityScores.length + aiSuggestions.length + aiRealtimeChecks.length + aiCoachingQueue.length + knowledgeArticles.length,
        empty: `${qualityScores.length} оценок, ${aiSuggestions.length} подсказок, ${aiCoachingQueue.length} рекомендаций`,
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
            disabled={!access.canScoreQuality || batchScoring || !aiSuggestions.length}
            onClick={() => void handleScoreAiSuggestions()}
            title={!access.canScoreQuality ? access.reason : aiSuggestions.length ? "Проверить подсказки локальными правилами." : "Подсказок для проверки нет."}
            type="button"
          >
            <ShieldCheck size={17} />
            {batchScoring ? "Проверка..." : "Проверить текст"}
          </button>
        </>
      }
    >
      {!qualityScores.length && !aiSuggestions.length && !knowledgeArticles.length ? (
        <ScreenStateStrip items={[{ label: "Quality", tone: "empty", value: "Нет данных качества для tenant" }]} />
      ) : null}
      {!capabilities.aiProviderConnected ? (
        <ScreenStateStrip items={[{
          label: "Проверка текста",
          tone: "partial",
          value: "Работают локальные правила. Внешний ИИ-провайдер не подключен"
        }]} />
      ) : null}
      {capabilities.aiProviderConnected ? (
        <label className="quality-ai-consent">
          <input checked={aiConsent} onChange={(event) => setAiConsent(event.target.checked)} type="checkbox" />
          <span>Разрешить передачу обезличенного текста подключенному AI-провайдеру для этой сессии</span>
        </label>
      ) : null}

      <div className="metric-strip">
        <MetricTile icon={<Star size={21} />} label="CSAT" value={`${averageCsat}%`} detail="по закрытым диалогам" />
        <MetricTile icon={<AlertTriangle size={21} />} label="Низкие оценки" value={lowScores.length} detail="нужна проверка старшего" tone="danger" />
        <MetricTile icon={<CheckCircle2 size={21} />} label="Подсказки" value={aiSuggestions.length} detail="принять / изменить / отклонить" />
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
                    disabled={!access.canReviewQuality || reviewingScoreId === score.id || Boolean(manualReviewIds[score.id])}
                    onClick={() => setReviewDraft(createQaReviewDraft(score))}
                    title={!access.canReviewQuality ? access.reason : manualReviewIds[score.id] ? `Backend review: ${manualReviewIds[score.id]}` : "Создать ручную проверку."}
                    type="button"
                  >
                    {reviewingScoreId === score.id ? "Проверка..." : manualReviewIds[score.id] ? "Проверено" : "Проверить"}
                  </button>
                </footer>
                {reviewDraft?.qualityScoreId === score.id ? (
                  <form className="qa-review-form" onSubmit={(event) => { event.preventDefault(); void handleManualQaReview(score); }}>
                    <strong>Ручная проверка</strong>
                    {QA_CRITERIA.map((criterion) => (
                      <label key={criterion.id}>
                        <span>{criterion.label}</span>
                        <select
                          value={reviewDraft.criteria[criterion.id]}
                          onChange={(event) => setReviewDraft((current) => ({
                            ...current,
                            criteria: { ...current.criteria, [criterion.id]: Number(event.target.value) }
                          }))}
                        >
                          {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} из 5</option>)}
                        </select>
                      </label>
                    ))}
                    <div className="qa-review-actions">
                      <b>Итог: {calculateQaScore(reviewDraft.criteria)} / 100</b>
                      <button type="button" onClick={() => setReviewDraft(null)}>Отмена</button>
                      <button className="primary-action" disabled={Boolean(reviewingScoreId)} type="submit">
                        {reviewingScoreId ? "Сохранение..." : "Сохранить проверку"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Подсказки оператору" action="требуют решения оператора" />
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
                <footer><span>Только просмотр: решения по подсказкам еще не подключены.</span></footer>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel">
        <SectionTitle title="Автоматическая проверка текста" action="локальные правила до отправки" />
        <AiQualityWorkspace
          aiConsent={aiConsent}
          coachingQueue={aiCoachingQueue}
          effectivenessMetrics={aiEffectivenessMetrics}
          onToast={onToast}
          realtimeChecks={aiRealtimeChecks}
        />
      </section>

      <section className="work-panel">
        <SectionTitle title="База знаний" action="редактор и публикация статей" />
        <KnowledgeBaseWorkspace articles={knowledgeArticles} canWrite={access.canManageKnowledge} onToast={onToast} operator={operator} />
      </section>
    </ProductScreen>
  );
}

function resolveManualQaReviewer(operator) {
  return String(operator?.id ?? operator?.email ?? operator?.name ?? "senior-qa").trim() || "senior-qa";
}

const QA_CRITERIA = [
  { id: "accuracy", label: "Точность ответа" },
  { id: "completeness", label: "Полнота решения" },
  { id: "communication", label: "Понятность и тон" },
  { id: "process", label: "Соблюдение процесса" }
];

function createQaReviewDraft(score) {
  const initial = Math.max(0, Math.min(5, Math.round(Number(score?.score ?? 0))));
  return {
    criteria: Object.fromEntries(QA_CRITERIA.map((criterion) => [criterion.id, initial])),
    qualityScoreId: score.id
  };
}

function calculateQaScore(criteria = {}) {
  const values = QA_CRITERIA.map((criterion) => Number(criteria[criterion.id] ?? 0));
  return Math.round((values.reduce((sum, value) => sum + value, 0) / (values.length * 5)) * 100);
}
