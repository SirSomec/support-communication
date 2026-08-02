import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  RefreshCw,
  ShieldCheck,
  Star,
  UserCheck
} from "lucide-react";
import { mapApiConversation } from "../../app/conversationApiMapper.js";
import { submitManualQaReview } from "../../app/qualityAiActions.js";
import { dialogService } from "../../services/dialogService.js";
import { qualityService } from "../../services/qualityService.js";
import { ChannelBadge, Modal, ProductScreen, ToolbarSearch } from "../../ui.jsx";
import "./quality.css";

export function QualityScreen({ access, onBack, onToast, operator }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [qualityScores, setQualityScores] = useState([]);
  const [manualReviews, setManualReviews] = useState([]);
  const [aiScoringAudits, setAiScoringAudits] = useState([]);
  const [summary, setSummary] = useState({});
  const [capabilities, setCapabilities] = useState({ aiProviderConnected: false, scoringMode: "rules" });
  const [scoreQuery, setScoreQuery] = useState("");
  const [scoreChannelFilter, setScoreChannelFilter] = useState("all");
  const [scoreOperatorFilter, setScoreOperatorFilter] = useState("all");
  const [scoreReviewFilter, setScoreReviewFilter] = useState("all");
  const [scorePeriod, setScorePeriod] = useState("all");
  const [scoreSort, setScoreSort] = useState("newest");
  const [scorePage, setScorePage] = useState(1);
  const [reviewingScoreId, setReviewingScoreId] = useState("");
  const [reviewDraft, setReviewDraft] = useState(null);
  const [audit, setAudit] = useState(null);

  const manualReviewIds = useMemo(() => {
    const byConversation = new Map();
    for (const review of [...manualReviews].sort((left, right) => qualityScoreTime(right) - qualityScoreTime(left))) {
      if (review?.conversationId && !byConversation.has(review.conversationId)) {
        byConversation.set(review.conversationId, review.reviewId);
      }
    }
    return Object.fromEntries(qualityScores.map((score) => [
      score.id,
      score.manualReviewId ?? byConversation.get(score.conversationId) ?? null
    ]));
  }, [manualReviews, qualityScores]);

  function applyWorkspace(data = {}) {
    setQualityScores(Array.isArray(data.qualityScores) ? data.qualityScores : Array.isArray(data.qualityMetrics) ? data.qualityMetrics : []);
    setManualReviews(Array.isArray(data.manualQaReviews) ? data.manualQaReviews : []);
    setAiScoringAudits(Array.isArray(data.aiScoringAudits) ? data.aiScoringAudits : []);
    setSummary(data.summary && typeof data.summary === "object" ? data.summary : {});
    setCapabilities({
      aiProviderConnected: Boolean(data.capabilities?.aiProviderConnected),
      scoringMode: data.capabilities?.scoringMode ?? "rules"
    });
  }

  async function refreshWorkspace({ background = false } = {}) {
    background ? setRefreshing(true) : setLoading(true);
    setError("");
    const response = await qualityService.fetchQualityWorkspace();
    if (response.status === "ok") {
      applyWorkspace(response.data);
    } else {
      setError(response.error?.message ?? "Не удалось загрузить данные качества.");
    }
    background ? setRefreshing(false) : setLoading(false);
    return response;
  }

  useEffect(() => {
    let ignore = false;
    async function loadWorkspace() {
      const response = await qualityService.fetchQualityWorkspace();
      if (ignore) return;
      if (response.status === "ok") {
        applyWorkspace(response.data);
      } else {
        setError(response.error?.message ?? "Не удалось загрузить данные качества.");
      }
      setLoading(false);
    }
    void loadWorkspace();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    setScorePage(1);
  }, [scoreQuery, scoreChannelFilter, scoreOperatorFilter, scoreReviewFilter, scorePeriod, scoreSort]);

  const lowScores = qualityScores.filter(isLowQualityScore);
  const pendingLowScores = lowScores.filter((score) => !manualReviewIds[score.id]);
  const scoreChannelOptions = collectQualityScoreOptions(qualityScores, (score) => score.channel);
  const scoreOperatorOptions = collectQualityOperatorOptions(qualityScores);
  const normalizedScoreQuery = scoreQuery.trim().toLowerCase();
  const periodStart = resolvePeriodStart(scorePeriod);
  const visibleQualityScores = qualityScores
    .filter((score) => {
      if (scoreChannelFilter !== "all" && String(score.channel ?? "") !== scoreChannelFilter) return false;
      if (scoreOperatorFilter !== "all" && String(score.operator ?? "") !== scoreOperatorFilter) return false;
      if (scoreReviewFilter === "reviewed" && !manualReviewIds[score.id]) return false;
      if (scoreReviewFilter === "unreviewed" && manualReviewIds[score.id]) return false;
      if (scoreReviewFilter === "attention" && (!isLowQualityScore(score) || manualReviewIds[score.id])) return false;
      if (periodStart && qualityScoreTime(score) < periodStart) return false;
      if (!normalizedScoreQuery) return true;
      return [score.client, score.comment, score.topic, score.operatorName, score.operator, score.channel, score.conversationId]
        .join(" ")
        .toLowerCase()
        .includes(normalizedScoreQuery);
    })
    .sort((left, right) => compareQualityScores(left, right, scoreSort));
  const scoreTotalPages = Math.max(1, Math.ceil(visibleQualityScores.length / QUALITY_SCORE_PAGE_SIZE));
  const scoreCurrentPage = Math.min(scorePage, scoreTotalPages);
  const pagedQualityScores = visibleQualityScores.slice((scoreCurrentPage - 1) * QUALITY_SCORE_PAGE_SIZE, scoreCurrentPage * QUALITY_SCORE_PAGE_SIZE);
  const scoreRangeStart = visibleQualityScores.length ? (scoreCurrentPage - 1) * QUALITY_SCORE_PAGE_SIZE + 1 : 0;
  const scoreRangeEnd = Math.min(scoreCurrentPage * QUALITY_SCORE_PAGE_SIZE, visibleQualityScores.length);
  const averageCsat = summary.averageCsat ?? calculateAverageCsat(qualityScores);
  const qaCoverage = summary.qaCoverage ?? calculateQaCoverage(qualityScores, manualReviewIds);

  async function openAudit(score) {
    setReviewDraft(manualReviewIds[score.id] ? null : createQaReviewDraft(score));
    setAudit({ conversation: null, error: "", loading: true, score });
    const response = await dialogService.fetchDialogDetail(score.conversationId);
    setAudit((current) => {
      if (!current || current.score.id !== score.id) return current;
      if (response.status !== "ok") {
        return { ...current, error: response.error?.message ?? "Не удалось загрузить переписку диалога.", loading: false };
      }
      return {
        ...current,
        conversation: mapApiConversation({
          ...(response.data?.conversation ?? {}),
          lifecycleEvents: response.data?.lifecycleEvents ?? []
        }),
        loading: false
      };
    });
  }

  function closeAudit() {
    setAudit(null);
    setReviewDraft(null);
  }

  async function handleManualQaReview(score) {
    if (reviewingScoreId || !reviewDraft) return;
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
    await refreshWorkspace({ background: true });
    closeAudit();
    onToast(`Ручная проверка сохранена: ${result.reviewId}.`);
  }

  const headerAction = (
    <button className="quality-refresh-button" disabled={refreshing} onClick={() => void refreshWorkspace({ background: true })} type="button">
      <RefreshCw className={refreshing ? "spin" : undefined} size={16} />
      {refreshing ? "Обновляем" : "Обновить"}
    </button>
  );

  if (loading) {
    return (
      <ProductScreen title="Качество" subtitle="Оценки клиентов и контроль работы команды" onBack={onBack} actions={headerAction}>
        <QualityLoadingState />
      </ProductScreen>
    );
  }

  if (error && !qualityScores.length) {
    return (
      <ProductScreen title="Качество" subtitle="Оценки клиентов и контроль работы команды" onBack={onBack} actions={headerAction}>
        <section className="quality-state quality-state-error" role="alert">
          <AlertTriangle size={28} />
          <div><h2>Не удалось загрузить данные</h2><p>{error}</p></div>
          <button onClick={() => void refreshWorkspace()} type="button">Повторить</button>
        </section>
      </ProductScreen>
    );
  }

  return (
    <ProductScreen title="Качество" subtitle="Оценки клиентов и контроль работы команды" onBack={onBack} actions={headerAction}>
      {error ? <div className="quality-inline-error" role="alert">{error}</div> : null}

      <section aria-label="Ключевые показатели качества" className="quality-metrics">
        <QualityMetric icon={<Star size={18} />} label="CSAT" value={averageCsat === null ? "—" : `${averageCsat}%`} detail={averageCsat === null ? "Оценок пока нет" : "Средняя оценка клиентов"} />
        <QualityMetric icon={<CircleGauge size={18} />} label="Оценок" value={summary.ratingCount ?? qualityScores.length} detail="В текущей истории" />
        <QualityMetric danger={pendingLowScores.length > 0} icon={<AlertTriangle size={18} />} label="Требуют проверки" value={pendingLowScores.length} detail={pendingLowScores.length ? "Низкая оценка без QA" : "Очередь разобрана"} />
        <QualityMetric icon={<UserCheck size={18} />} label="Покрытие QA" value={qaCoverage === null ? "—" : `${qaCoverage}%`} detail={formatManualReviewCount(manualReviews.length)} />
      </section>

      <div className="quality-workspace-grid" data-testid="quality-workspace">
        <section className="quality-review-panel">
          <header className="quality-section-heading">
            <div><h2>Оценки и ручной QA</h2><p>Клиентские оценки и результаты выборочной проверки диалогов</p></div>
            <span>{visibleQualityScores.length} из {qualityScores.length}</span>
          </header>

          {qualityScores.length ? (
            <>
              <div className="quality-filter-bar">
                <ToolbarSearch ariaLabel="Поиск по оценкам" iconSize={16} placeholder="Клиент, тема или оператор" value={scoreQuery} onChange={setScoreQuery} />
                <QualitySelect ariaLabel="Период оценки" value={scorePeriod} onChange={setScorePeriod}>
                  <option value="all">За всё время</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option>
                </QualitySelect>
                <QualitySelect ariaLabel="Канал оценки" value={scoreChannelFilter} onChange={setScoreChannelFilter}>
                  <option value="all">Все каналы</option>{scoreChannelOptions.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </QualitySelect>
                <QualitySelect ariaLabel="Оператор оценки" value={scoreOperatorFilter} onChange={setScoreOperatorFilter}>
                  <option value="all">Все операторы</option>{scoreOperatorOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </QualitySelect>
                <QualitySelect ariaLabel="Статус проверки" value={scoreReviewFilter} onChange={setScoreReviewFilter}>
                  <option value="all">Все статусы</option><option value="attention">Требуют проверки</option><option value="reviewed">Проверенные</option><option value="unreviewed">Без проверки</option>
                </QualitySelect>
                <QualitySelect ariaLabel="Сортировка оценок" value={scoreSort} onChange={setScoreSort}>
                  {QUALITY_SCORE_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </QualitySelect>
              </div>

              <div className="quality-table" role="table" aria-label="Оценки качества">
                <div className="quality-table-head" role="row">
                  <span role="columnheader">Клиент</span><span role="columnheader">Оценка</span><span role="columnheader">Канал</span><span role="columnheader">Оператор</span><span role="columnheader">Дата</span><span role="columnheader">Проверка</span>
                </div>
                {!visibleQualityScores.length ? (
                  <div className="quality-filter-empty" role="row"><strong>Ничего не найдено</strong><span>Измените фильтры или поисковый запрос.</span></div>
                ) : null}
                {pagedQualityScores.map((score) => (
                  <QualityScoreRow
                    key={score.id}
                    manualReviewId={manualReviewIds[score.id]}
                    onOpen={openAudit}
                    score={score}
                  />
                ))}
              </div>

              <footer className="quality-pagination">
                <span>Показано {scoreRangeStart}–{scoreRangeEnd} из {visibleQualityScores.length}</span>
                <div>
                  <button aria-label="Предыдущая страница" disabled={scoreCurrentPage <= 1} onClick={() => setScorePage(scoreCurrentPage - 1)} type="button"><ChevronLeft size={16} /></button>
                  <b>{scoreCurrentPage}</b><span>из {scoreTotalPages}</span>
                  <button aria-label="Следующая страница" disabled={scoreCurrentPage >= scoreTotalPages} onClick={() => setScorePage(scoreCurrentPage + 1)} type="button"><ChevronRight size={16} /></button>
                </div>
              </footer>
            </>
          ) : (
            <QualityEmptyState onRefresh={() => void refreshWorkspace({ background: true })} refreshing={refreshing} />
          )}
        </section>

        <aside className="quality-context-rail">
          <AutomationStatus capabilities={capabilities} />
          <RecentScoringAudits audits={aiScoringAudits} />
        </aside>
      </div>

      {audit ? (
        <QualityAuditModal
          access={access}
          audit={audit}
          manualReviewId={manualReviewIds[audit.score.id]}
          onClose={closeAudit}
          onSubmit={handleManualQaReview}
          reviewDraft={reviewDraft}
          reviewingScoreId={reviewingScoreId}
          setReviewDraft={setReviewDraft}
        />
      ) : null}
    </ProductScreen>
  );
}

function QualityMetric({ danger = false, detail, icon, label, value }) {
  return <article className={`quality-metric ${danger ? "danger" : ""}`}><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function QualitySelect({ ariaLabel, children, onChange, value }) {
  return <select aria-label={ariaLabel} className="quality-select" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>;
}

function QualityScoreRow({ manualReviewId, onOpen, score }) {
  const low = isLowQualityScore(score);
  const client = String(score.client ?? score.conversationId ?? "Клиент");
  return (
    <article className={`quality-row ${low ? "danger" : ""}`} role="row">
      <div className="quality-client-cell" role="cell"><span aria-hidden="true">{initialsFor(client)}</span><div><strong>{client}</strong><small>{score.topic || score.conversationId}</small></div></div>
      <div role="cell"><span className={`quality-score-value ${low ? "danger" : ""}`}>{formatScore(score)}</span></div>
      <div role="cell"><ChannelBadge channel={score.channel || "—"} /></div>
      <div className="quality-operator-cell" role="cell"><strong>{score.operatorName || score.operator || "—"}</strong></div>
      <time dateTime={score.createdAt || undefined} role="cell">{formatQualityDate(score.createdAt)}</time>
      <div className="quality-review-cell" role="cell">
        <span className={manualReviewId ? "reviewed" : low ? "attention" : "pending"}>{manualReviewId ? <CheckCircle2 size={14} /> : low ? <AlertTriangle size={14} /> : <Clock3 size={14} />}{manualReviewId ? "Проверено" : low ? "Требует проверки" : "Не проверено"}</span>
        <button onClick={() => void onOpen(score)} type="button">{manualReviewId ? "Открыть" : "Проверить"}</button>
      </div>
    </article>
  );
}

function AutomationStatus({ capabilities }) {
  const connected = capabilities.aiProviderConnected;
  return (
    <section className="quality-rail-section quality-automation-panel">
      <header><Bot size={18} /><h2>Проверка текста ответа</h2></header>
      <div className="quality-automation-explainer">
        <strong>Это не CSI/CSAT</strong>
        <p>CSI/CSAT ставит клиент после закрытия диалога. Здесь проверяется черновик ответа оператора до отправки.</p>
      </div>
      <ol className="quality-automation-steps">
        <li><span>1</span><div><strong>Во время набора</strong><small>Локальные правила автоматически проверяют тон, полноту и следующий шаг.</small></div></li>
        <li><span>2</span><div><strong>При запуске AI‑оценки</strong><small>Черновик передаётся AI только с согласием оператора. Если AI недоступен, остаётся проверка по правилам.</small></div></li>
        <li><span>3</span><div><strong>После проверки</strong><small>Оценка от 0 до 100 и замечания сохраняются в журнале ниже.</small></div></li>
      </ol>
      <dl>
        <div><dt>AI‑провайдер</dt><dd className={connected ? "ok" : "muted"}><i />{connected ? "Подключён" : "Отключён"}</dd></div>
        <div><dt>Режим оценки</dt><dd>{qualityScoringModeLabel(capabilities.scoringMode)}</dd></div>
        <div><dt>Передача данных</dt><dd>{connected ? "Только с согласием оператора" : "Данные не передаются"}</dd></div>
      </dl>
      <p><ShieldCheck size={16} />AI не выставляет CSI/CSAT и не меняет клиентскую оценку.</p>
    </section>
  );
}

function RecentScoringAudits({ audits }) {
  const recent = [...audits].sort((left, right) => qualityScoreTime(right) - qualityScoreTime(left)).slice(0, 6);
  return (
    <section className="quality-rail-section quality-audit-history">
      <header><h2>Последние автопроверки</h2><span>{audits.length}</span></header>
      {recent.length ? <div>{recent.map((audit) => {
        const score = Number.isFinite(Number(audit.score)) ? Number(audit.score) : null;
        return <article key={audit.auditId}><span className={audit.status === "failed" ? "failed" : score !== null && score < 60 ? "warn" : "ok"}>{audit.status === "failed" ? "!" : score ?? "—"}</span><div><strong>{qualityAuditStatusLabel(audit.status, score)}</strong><small>{formatQualityDate(audit.updatedAt ?? audit.createdAt)} · {audit.conversationId || "Черновик"}</small></div></article>;
      })}</div> : <div className="quality-rail-empty"><Clock3 size={20} /><strong>Проверок пока нет</strong><p>История появится после проверки ответа в диалоге.</p></div>}
    </section>
  );
}

function QualityEmptyState({ onRefresh, refreshing }) {
  return (
    <div className="quality-empty-state">
      <span className="quality-empty-icon"><ShieldCheck size={26} /></span>
      <h3>Данных качества пока нет</h3>
      <p>Раздел заполнится реальными событиями этого tenant — без демонстрационных оценок и подсказок.</p>
      <ol>
        <li><span>1</span><div><strong>Собирайте оценки</strong><small>CSAT появится после закрытия и оценки диалога клиентом.</small></div></li>
        <li><span>2</span><div><strong>Проводите ручной QA</strong><small>Низкие оценки попадут в очередь проверки автоматически.</small></div></li>
        <li><span>3</span><div><strong>Проверяйте текст ответа</strong><small>Локальная проверка работает при наборе, а AI‑оценка запускается отдельно и не влияет на CSAT.</small></div></li>
      </ol>
      <button disabled={refreshing} onClick={onRefresh} type="button"><RefreshCw className={refreshing ? "spin" : undefined} size={16} />{refreshing ? "Обновляем" : "Проверить данные"}</button>
    </div>
  );
}

function QualityLoadingState() {
  return <div className="quality-loading-state" aria-label="Загрузка данных качества"><div className="quality-metrics">{[0, 1, 2, 3].map((item) => <span key={item} />)}</div><div className="quality-loading-panel" /></div>;
}

function QualityAuditModal({ access, audit, manualReviewId, onClose, onSubmit, reviewDraft, reviewingScoreId, setReviewDraft }) {
  return (
    <Modal eyebrow={`${audit.score.scale}: ${audit.score.score} · ${audit.score.operatorName || audit.score.operator}`} onClose={onClose} overlayClassName="confirm-overlay quality-audit-overlay" panelClassName="confirm-panel quality-audit-panel" title={`${audit.score.client} — аудит диалога`} titleId="quality-audit-title">
      <div className="quality-audit-body">
        <section aria-label="Переписка диалога" className="quality-transcript">
          {audit.loading ? <p className="quality-audit-note">Загрузка переписки...</p> : null}
          {audit.error ? <p className="quality-audit-note danger">{audit.error}</p> : null}
          {!audit.loading && !audit.error && !(audit.conversation?.messages ?? []).length ? <p className="quality-audit-note">Сообщений в диалоге нет.</p> : null}
          {(audit.conversation?.messages ?? []).map((message) => message.type === "event" ? (
            <div className="quality-transcript-event" key={message.id}><span>{message.text}</span><small>{message.time}</small></div>
          ) : (
            <div className={`quality-transcript-message ${message.side === "agent" || message.type === "internal" ? "agent" : "client"} ${message.type === "internal" ? "internal" : ""}`} key={message.id}>
              {message.author ? <small>{message.author}</small> : null}<p>{message.text}</p><span>{message.time}</span>
            </div>
          ))}
        </section>
        <section aria-label="Ручная проверка" className="quality-audit-review">
          {manualReviewId ? <p className="quality-audit-note quality-reviewed-note"><CheckCircle2 size={16} />Диалог уже проверен: {manualReviewId}</p> : reviewDraft?.qualityScoreId === audit.score.id ? (
            <form className="qa-review-form" onSubmit={(event) => { event.preventDefault(); void onSubmit(audit.score); }}>
              <header><div><strong>Ручная проверка</strong><span>Оцените диалог по четырём критериям</span></div><b>{calculateQaScore(reviewDraft.criteria)} / 100</b></header>
              {QA_CRITERIA.map((criterion) => (
                <label key={criterion.id}><span>{criterion.label}</span><select value={reviewDraft.criteria[criterion.id]} onChange={(event) => setReviewDraft((current) => ({ ...current, criteria: { ...current.criteria, [criterion.id]: Number(event.target.value) } }))}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} из 5</option>)}</select></label>
              ))}
              <div className="qa-review-actions"><button onClick={onClose} type="button">Отмена</button><button className="primary-action" disabled={!access.canReviewQuality || Boolean(reviewingScoreId)} title={!access.canReviewQuality ? access.reason : "Сохранить ручную проверку."} type="submit">{reviewingScoreId ? "Сохранение..." : "Сохранить проверку"}</button></div>
            </form>
          ) : null}
        </section>
      </div>
    </Modal>
  );
}

function resolveManualQaReviewer(operator) { return String(operator?.id ?? operator?.email ?? operator?.name ?? "senior-qa").trim() || "senior-qa"; }

const QUALITY_SCORE_PAGE_SIZE = 10;
const QUALITY_SCORE_SORT_OPTIONS = [
  { label: "Сначала новые", value: "newest" },
  { label: "Сначала старые", value: "oldest" },
  { label: "Низкие оценки сначала", value: "score-asc" },
  { label: "Высокие оценки сначала", value: "score-desc" }
];
const QA_CRITERIA = [
  { id: "accuracy", label: "Точность ответа" },
  { id: "completeness", label: "Полнота решения" },
  { id: "communication", label: "Понятность и тон" },
  { id: "process", label: "Соблюдение процесса" }
];

function collectQualityScoreOptions(scores, readValue) { return [...new Set(scores.map((score) => String(readValue(score) ?? "").trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "ru")); }
function collectQualityOperatorOptions(scores) {
  const labels = new Map();
  for (const score of scores) {
    const value = String(score.operator ?? "").trim();
    if (!value) continue;
    const label = String(score.operatorName ?? "").trim() || value;
    if (!labels.has(value) || labels.get(value) === value) labels.set(value, label);
  }
  return [...labels.entries()].map(([value, label]) => ({ label, value })).sort((left, right) => left.label.localeCompare(right.label, "ru"));
}
function qualityScoreTime(score) { const time = Date.parse(String(score?.updatedAt ?? score?.createdAt ?? "")); return Number.isFinite(time) ? time : 0; }
function normalizedQualityScore(score) { const value = Number(score?.score); if (!Number.isFinite(value)) return -1; return score?.scale === "QA" ? value / 20 : value; }
function compareQualityScores(left, right, sort) {
  if (sort === "oldest") return qualityScoreTime(left) - qualityScoreTime(right);
  if (sort === "score-asc") return normalizedQualityScore(left) - normalizedQualityScore(right);
  if (sort === "score-desc") return normalizedQualityScore(right) - normalizedQualityScore(left);
  return qualityScoreTime(right) - qualityScoreTime(left);
}
function isLowQualityScore(score) { const value = Number(score?.score); return Number.isFinite(value) && (score?.scale === "QA" ? value < 80 : value < 4); }
function calculateAverageCsat(scores) {
  const values = scores.filter((score) => score.scale === "CSAT" && Number.isFinite(Number(score.score))).map((score) => Number(score.score));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 20) : null;
}
function calculateQaCoverage(scores, reviewIds) { return scores.length ? Math.round(scores.filter((score) => reviewIds[score.id]).length / scores.length * 100) : null; }
function formatManualReviewCount(count) { const form = new Intl.PluralRules("ru-RU").select(count); return `${count} ${form === "one" ? "ручная проверка" : form === "few" ? "ручные проверки" : "ручных проверок"}`; }
function resolvePeriodStart(period) { const days = Number(period); return Number.isFinite(days) && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null; }
function formatScore(score) { const value = Number(score?.score); if (!Number.isFinite(value)) return "—"; return score?.scale === "QA" ? `${value}%` : `${value}/5`; }
function formatQualityDate(value) { const time = Date.parse(String(value ?? "")); return Number.isFinite(time) ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(time) : "—"; }
function initialsFor(value) { return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "К"; }
function qualityScoringModeLabel(mode) { return mode === "ai_with_rules_fallback" ? "AI + локальные правила" : mode === "ai" ? "AI‑оценка" : "Локальные правила"; }
function qualityAuditStatusLabel(status, score) { if (status === "failed") return "Ошибка проверки"; if (status === "pending") return "Проверка выполняется"; return score !== null && score < 60 ? "Нужна корректировка" : "Проверка завершена"; }
function createQaReviewDraft(score) { const initial = score?.scale === "QA" ? Number(score.score) / 20 : Number(score?.score ?? 0); const normalized = Math.max(0, Math.min(5, Math.round(initial))); return { criteria: Object.fromEntries(QA_CRITERIA.map((criterion) => [criterion.id, normalized])), qualityScoreId: score.id }; }
function calculateQaScore(criteria = {}) { const values = QA_CRITERIA.map((criterion) => Number(criteria[criterion.id] ?? 0)); return Math.round(values.reduce((sum, value) => sum + value, 0) / (values.length * 5) * 100); }
