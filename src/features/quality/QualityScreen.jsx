import React from "react";
import { AlertTriangle, BookOpen, Filter, Sparkles, Star } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import {
  aiCoachingQueue,
  aiEffectivenessMetrics,
  aiRealtimeChecks,
  aiSuggestions,
  knowledgeArticles,
  qualityScores
} from "../../data.js";
import { ChannelBadge, MetricTile, ProductScreen, SectionTitle } from "../../ui.jsx";
import { AiQualityWorkspace } from "./AiQualityWorkspace.jsx";
import { KnowledgeBaseWorkspace } from "./KnowledgeBaseWorkspace.jsx";

export function QualityScreen({ onBack, onToast }) {
  const lowScores = qualityScores.filter((item) => Number(item.score) < 4 || item.status.includes("Низкая"));
  const averageCsat = Math.round(
    qualityScores
      .filter((item) => item.scale === "CSAT")
      .reduce((sum, item, _, list) => sum + (Number(item.score) / 5) * 100 / list.length, 0)
  );

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
          <button onClick={() => onToast("Фильтр низких оценок применен к очереди старшего сотрудника.")} type="button">
            <Filter size={17} />
            Низкие оценки
          </button>
          <button className="primary-action" onClick={() => onToast("AI-проверка диалогов поставлена в очередь.")} type="button">
            <Sparkles size={17} />
            AI-проверка
          </button>
        </>
      }
    >
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
            {qualityScores.map((score) => (
              <article className={`quality-row ${Number(score.score) < 4 ? "danger" : ""}`} key={score.id}>
                <header>
                  <strong>{score.client}</strong>
                  <ChannelBadge channel={score.channel} />
                  <b>{score.scale}: {score.score}</b>
                </header>
                <p>{score.comment}</p>
                <footer>
                  <span>{score.operator} · {score.topic}</span>
                  <button onClick={() => onToast(`${score.client}: ${score.status}`)} type="button">Проверить</button>
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
                <footer>
                  {suggestion.actions.map((action) => (
                    <button key={action} onClick={() => onToast(`${suggestion.title}: ${action}`)} type="button">{action}</button>
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
        <KnowledgeBaseWorkspace articles={knowledgeArticles} onToast={onToast} />
      </section>
    </ProductScreen>
  );
}
