import React, { useEffect, useMemo, useRef, useState } from "react";
import "./knowledge.css";
import {
  Archive,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  HelpCircle,
  Link2,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload
} from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { uploadComposerAttachment } from "../../app/useComposerAttachments.js";
import { buildSourceBotHints } from "./knowledgeSourceHints.js";
import { collectKnowledgeLoadErrors } from "./knowledgeLoadModel.js";
import { knowledgeService } from "../../services/knowledgeService.js";
import { automationService } from "../../services/automationService.js";
import { ConfirmDialog, MetricTile, Modal, ProductScreen, SectionTitle, SegmentedControl, StatusBadge } from "../../ui.jsx";
import { KnowledgeBaseWorkspace } from "../quality/KnowledgeBaseWorkspace.jsx";

const TABS = [
  { label: "Статьи", value: "articles" },
  { label: "Документы", value: "documents" },
  { label: "Страницы", value: "pages" },
  { label: "MCP-подключения", value: "mcp" },
  { label: "Вопросы без ответа", value: "unanswered" },
  { label: "Обратная связь", value: "feedback" }
];

const FEEDBACK_LABELS = {
  not_helped: { label: "Не помогло", tone: "warn" },
  wrong_source: { label: "Неверный источник", tone: "warn" }
};

const SOURCE_STATUS_LABELS = {
  archived: { label: "Архив", tone: "closed" },
  disabled: { label: "Отключён", tone: "hold" },
  draft: { label: "Черновик", tone: "info" },
  failed: { label: "Ошибка", tone: "warn" },
  fetching: { label: "Загрузка", tone: "info" },
  indexing: { label: "Индексация", tone: "info" },
  ready: { label: "Готов", tone: "ok" },
  uploaded: { label: "Загружен", tone: "info" }
};

/** Раздел «Знания» (BAI-820): всё, что знает бот и операторы, — в одном месте. */
export function KnowledgeScreen({ access, onBack, onToast, operator }) {
  const [tab, setTab] = useState("articles");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [articles, setArticles] = useState([]);
  const [sources, setSources] = useState([]);
  const [usage, setUsage] = useState({});
  const [questions, setQuestions] = useState([]);
  const [mcpConnectors, setMcpConnectors] = useState([]);
  const [mcpForm, setMcpForm] = useState(null);
  const [feedback, setFeedback] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [previewTarget, setPreviewTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [urlForm, setUrlForm] = useState(null);
  const [articleSourceForm, setArticleSourceForm] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const canWrite = Boolean(access.canManageKnowledge);
  const busy = Boolean(busyAction);

  async function loadAll({ silent } = {}) {
    if (!silent) setLoading(true);
    setError("");
    const [articlesResponse, sourcesResponse, unansweredResponse, mcpResponse, feedbackResponse] = await Promise.all([
      knowledgeService.fetchArticles(),
      knowledgeService.fetchSources(),
      knowledgeService.fetchUnansweredQuestions(),
      knowledgeService.fetchMcpConnectors(),
      automationService.listBotAiFeedback()
    ]);
    const loadErrors = collectKnowledgeLoadErrors({
      articlesResponse,
      feedbackResponse,
      mcpResponse,
      sourcesResponse,
      unansweredResponse
    });
    if (articlesResponse.status === "ok") {
      setArticles(normalizeList(articlesResponse.data?.articles ?? articlesResponse.data?.items));
    }
    if (sourcesResponse.status === "ok") {
      setSources(normalizeList(sourcesResponse.data?.sources));
      setUsage(sourcesResponse.data?.usage && typeof sourcesResponse.data.usage === "object" ? sourcesResponse.data.usage : {});
    }
    if (unansweredResponse.status === "ok") {
      setQuestions(normalizeList(unansweredResponse.data?.questions));
    }
    if (mcpResponse.status === "ok") {
      setMcpConnectors(normalizeList(mcpResponse.data?.connectors));
    }
    if (feedbackResponse.status === "ok") {
      setFeedback(normalizeList(feedbackResponse.data?.feedback));
    }
    setError(loadErrors.join(" "));
    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const documents = useMemo(() => sources.filter((source) => source.kind === "document"), [sources]);
  const pages = useMemo(() => sources.filter((source) => source.kind === "url" || source.kind === "link"), [sources]);
  const mcpSources = useMemo(() => sources.filter((source) => source.kind === "mcp"), [sources]);
  const approvedMcp = useMemo(() => mcpConnectors.filter((connector) => connector.approvedAt && connector.status === "enabled"), [mcpConnectors]);
  const openQuestions = useMemo(() => questions.filter((question) => question.status === "open"), [questions]);
  const pendingFeedback = useMemo(() => feedback.filter((item) => item.reviewRequired), [feedback]);
  const readySources = sources.filter((source) => source.readiness === "ready").length;
  const publishedArticles = articles.filter((article) => String(article.status).toLowerCase().includes("publish") || article.status === "Опубликована").length;

  async function runSourceAction(actionId, action, { successMessage } = {}) {
    if (!canWrite) return onToast(access.reason);
    setBusyAction(actionId);
    try {
      const response = await action();
      if (response.status !== "ok") {
        onToast(response.error?.message ?? "Не удалось выполнить действие с источником.");
        return null;
      }
      if (successMessage) onToast(successMessage);
      await loadAll({ silent: true });
      return response;
    } finally {
      setBusyAction("");
    }
  }

  async function handleUploadDocument(file) {
    if (!file || !canWrite) return;
    setBusyAction("upload-document");
    try {
      const created = await knowledgeService.createSource({ kind: "document", sourceConfig: { upload: true }, title: file.name });
      const source = created.data?.source;
      if (created.status !== "ok" || !source) {
        onToast(created.error?.message ?? "Не удалось создать источник для файла.");
        return;
      }
      onToast("Файл загружается: антивирус → извлечение текста → индексация.");
      // Не переиспользуем createComposerAttachment: он ограничен PDF/картинками
      // (чат), а воркер знаний извлекает текстовые форматы. Строим объект напрямую.
      const knowledgeAttachment = buildKnowledgeUpload(file);
      const uploaded = await uploadComposerAttachment(knowledgeAttachment);
      if (uploaded.status === "error") {
        onToast(uploaded.error ?? "Файл не прошёл антивирусную проверку.");
        await loadAll({ silent: true });
        return;
      }
      if (!uploaded.fileId) {
        onToast("Загрузка не вернула идентификатор файла.");
        return;
      }
      const enqueue = await knowledgeService.enqueueSourceAttachment(source.id, {
        fileId: uploaded.fileId,
        idempotencyKey: `ks-upload-${source.id}`
      });
      if (enqueue.status !== "ok") {
        onToast(enqueue.error?.message ?? "Файл проверен, но индексация не запустилась.");
      } else {
        onToast("Файл в очереди индексации. Когда источник станет «Готов», одобрите его.");
      }
      await loadAll({ silent: true });
    } finally {
      setBusyAction("");
    }
  }

  async function handleCreateUrlSource() {
    const url = urlForm?.url?.trim();
    const title = urlForm?.title?.trim() || "Страница знаний";
    setUrlForm(null);
    if (!url) return;
    setBusyAction("create-url");
    try {
      const created = await knowledgeService.createSource({ kind: "url", sourceConfig: { url }, title });
      const source = created.data?.source;
      if (created.status !== "ok" || !source) return onToast(created.error?.message ?? "Не удалось добавить URL.");
      const refreshed = await knowledgeService.refreshSource(source.id);
      if (refreshed.status !== "ok") {
        onToast(refreshed.error?.message ?? "URL добавлен, но страницу не удалось прочитать. Проверьте адрес и allowlist.");
      } else {
        onToast("Страница прочитана. Проверьте предпросмотр и одобрите источник.");
      }
      await loadAll({ silent: true });
    } finally {
      setBusyAction("");
    }
  }

  async function handleCreateArticleSource() {
    const articleId = articleSourceForm?.articleId;
    setArticleSourceForm(null);
    if (!articleId) return;
    const article = articles.find((item) => item.id === articleId);
    await runSourceAction(`article-source-${articleId}`, () => knowledgeService.createSource({
      kind: "document",
      sourceRef: articleId,
      title: article?.title ?? "Статья базы знаний"
    }), { successMessage: "Источник из статьи создан и готов к выбору в сценариях." });
  }

  async function handleOpenPreview(source) {
    setPreviewTarget({ loading: true, source });
    const response = await knowledgeService.previewSource(source.id);
    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось получить предпросмотр.");
      setPreviewTarget(null);
      return;
    }
    setPreviewTarget({ loading: false, preview: response.data, query: "", results: null, source });
  }

  async function handlePreviewSearch() {
    if (!previewTarget?.source || !previewTarget.query?.trim()) return;
    const response = await knowledgeService.searchSources({
      query: previewTarget.query.trim(),
      sourceIds: [previewTarget.source.id],
      tokenBudget: 400
    });
    setPreviewTarget((current) => current
      ? { ...current, results: response.status === "ok" ? normalizeList(response.data?.passages) : [] }
      : current);
  }

  async function handleCreateArticleFromQuestion(question) {
    if (!canWrite) return onToast(access.reason);
    setBusyAction(`question-${question.id}`);
    try {
      const created = await knowledgeService.createArticle({
        body: `Вопрос клиента: «${question.question}»\n\nОпишите ответ здесь и опубликуйте статью, затем создайте из неё источник для бота.`,
        category: "Боты",
        title: question.question.slice(0, 120)
      });
      const article = created.data?.article;
      if (created.status !== "ok" || !article) {
        onToast(created.error?.message ?? "Не удалось создать статью.");
        return;
      }
      await knowledgeService.resolveUnansweredQuestion(question.id, { articleId: article.id });
      onToast("Черновик статьи создан из вопроса. Отредактируйте и опубликуйте его.");
      await loadAll({ silent: true });
      setTab("articles");
    } finally {
      setBusyAction("");
    }
  }

  async function handleRequestMcp() {
    const endpoint = mcpForm?.endpoint?.trim();
    const name = mcpForm?.name?.trim() || "MCP-подключение";
    const tools = splitTopicsInput(mcpForm?.tools);
    setMcpForm(null);
    if (!endpoint || !tools.length) return onToast("Укажите HTTPS-адрес и хотя бы один read-only инструмент.");
    setBusyAction("request-mcp");
    try {
      const response = await knowledgeService.requestMcpConnector({
        description: mcpForm?.description?.trim() || undefined,
        endpoint,
        name,
        tools: tools.map((tool) => ({ name: tool }))
      });
      if (response.status !== "ok") {
        onToast(response.error?.message ?? "Не удалось подать заявку на MCP-подключение.");
        return;
      }
      onToast("Заявка отправлена. Администратор сервиса одобрит подключение.");
      await loadAll({ silent: true });
    } finally {
      setBusyAction("");
    }
  }

  async function handleDismissQuestion(question) {
    if (!canWrite) return onToast(access.reason);
    const response = await knowledgeService.dismissUnansweredQuestion(question.id);
    if (response.status !== "ok") return onToast(response.error?.message ?? "Не удалось скрыть вопрос.");
    setQuestions((current) => current.map((item) => item.id === question.id ? { ...item, status: "dismissed" } : item));
  }

  async function handleResolveFeedback(item, action) {
    if (!canWrite) return onToast(access.reason);
    const response = await automationService.resolveBotAiFeedback(item.feedbackId, action);
    if (response.status !== "ok") return onToast(response.error?.message ?? "Не удалось отметить обратную связь.");
    setFeedback((current) => current.map((entry) => entry.feedbackId === item.feedbackId ? { ...entry, resolvedAction: action, reviewRequired: false } : entry));
    onToast("Обратная связь отмечена как разобранная. Знания не меняются автоматически.");
  }

  async function handleArticleFromFeedback(item) {
    if (!canWrite) return onToast(access.reason);
    setBusyAction(`feedback-${item.feedbackId}`);
    try {
      const created = await knowledgeService.createArticle({
        body: `Обратная связь оператора по диалогу ${item.conversationId}: «${item.outcome === "wrong_source" ? "неверный источник" : "не помогло"}».${item.comment ? `\nКомментарий: ${item.comment}` : ""}\n\nОпишите корректный ответ и опубликуйте статью, затем создайте из неё источник для бота.`,
        category: "Боты",
        title: `Исправление ответа бота (${item.conversationId})`.slice(0, 120)
      });
      if (created.status !== "ok" || !created.data?.article) {
        onToast(created.error?.message ?? "Не удалось создать статью.");
        return;
      }
      await automationService.resolveBotAiFeedback(item.feedbackId, "article_created");
      onToast("Черновик статьи создан из обратной связи. Отредактируйте и опубликуйте его.");
      await loadAll({ silent: true });
      setTab("articles");
    } finally {
      setBusyAction("");
    }
  }

  if (loading) {
    return (
      <ProductScreen
        onBack={onBack}
        stateItems={createScreenStateItems({ emptyWhenZero: "ожидание API", errorLabel: "ошибок нет", loading: "загружается...", total: 0 })}
        subtitle="Загрузка..."
        title="Знания"
      />
    );
  }

  return (
    <ProductScreen
      onBack={onBack}
      stateItems={createScreenStateItems({
        empty: `${sources.length} источников · ${articles.length} статей`,
        emptyWhenZero: "знаний пока нет",
        errorLabel: error ? "ошибка загрузки" : "ошибок нет",
        errors: error ? 1 : 0,
        total: sources.length + articles.length
      })}
      subtitle="Статьи, документы, страницы и подключения, по которым отвечают бот и операторы."
      title="Знания"
    >
      <div className="metric-strip">
        <MetricTile detail={`${readySources} готовы к ответам`} icon={<FileText size={21} />} label="Источники" value={sources.length} />
        <MetricTile detail={`${publishedArticles} опубликованы`} icon={<BookOpen size={21} />} label="Статьи" value={articles.length} />
        <MetricTile detail={`${pendingFeedback.length} на разбор`} icon={<HelpCircle size={21} />} label="Вопросы без ответа" value={openQuestions.length} />
        <MetricTile detail={`${approvedMcp.length} одобрено`} icon={<Plug size={21} />} label="MCP" value={mcpConnectors.length} />
      </div>

      <SegmentedControl ariaLabel="Разделы знаний" className="knowledge-tabs" onChange={setTab} options={TABS} value={tab} />

      {tab === "articles" ? (
        <section className="work-panel">
          <SectionTitle action="черновик → проверка → публикация" title="Статьи базы знаний" />
          <KnowledgeBaseWorkspace articles={articles} canWrite={canWrite} key={articles.map((article) => article.id).join(",")} onToast={onToast} operator={operator} />
        </section>
      ) : null}

      {tab === "documents" ? (
        <SourceManagerPanel
          actions={
            <>
              <button disabled={!canWrite || busy} onClick={() => setArticleSourceForm({ articleId: "" })} type="button">
                <Plus size={15} /> Из статьи
              </button>
              <UploadButton busy={busy} canWrite={canWrite} onUpload={handleUploadDocument} />
            </>
          }
          busyAction={busyAction}
          canWrite={canWrite}
          emptyMessage="Документов пока нет. Создайте источник из опубликованной статьи или загрузите файл (PDF, DOCX, TXT, MD)."
          onApprove={(source) => runSourceAction(`approve-${source.id}`, () => knowledgeService.approveSource(source.id), { successMessage: "Источник одобрен: бот может отвечать по нему." })}
          onArchive={(source) => runSourceAction(`archive-${source.id}`, () => knowledgeService.archiveSource(source.id), { successMessage: "Источник перемещён в архив." })}
          onDelete={(source) => setDeleteTarget(source)}
          onDisable={(source) => runSourceAction(`disable-${source.id}`, () => knowledgeService.disableSource(source.id), { successMessage: "Источник отключён: бот перестанет использовать его после ближайшего поиска." })}
          onEnable={(source) => runSourceAction(`enable-${source.id}`, () => knowledgeService.enableSource(source.id), { successMessage: "Источник снова включён." })}
          onPreview={handleOpenPreview}
          onRefresh={(source) => runSourceAction(`refresh-${source.id}`, () => knowledgeService.refreshDocumentSource(source.id), { successMessage: "Источник переиндексирован по текущей версии статьи. Одобрите его заново." })}
          onRename={(source) => setRenameTarget({ source, title: source.title })}
          sources={documents}
          title="Документы"
          usage={usage}
        />
      ) : null}

      {tab === "pages" ? (
        <SourceManagerPanel
          actions={
            <button disabled={!canWrite || busy} onClick={() => setUrlForm({ title: "", url: "" })} type="button">
              <Link2 size={15} /> Добавить URL-страницу
            </button>
          }
          busyAction={busyAction}
          canWrite={canWrite}
          emptyMessage="Страниц пока нет. Добавьте HTTPS-адрес — сервер безопасно прочитает страницу, а вы одобрите её содержимое. Допустимые домены настраивает администратор сервиса."
          onApprove={(source) => runSourceAction(`approve-${source.id}`, () => knowledgeService.approveSource(source.id), { successMessage: "Страница одобрена: бот может отвечать по ней." })}
          onArchive={(source) => runSourceAction(`archive-${source.id}`, () => knowledgeService.archiveSource(source.id), { successMessage: "Источник перемещён в архив." })}
          onDelete={(source) => setDeleteTarget(source)}
          onDisable={(source) => runSourceAction(`disable-${source.id}`, () => knowledgeService.disableSource(source.id), { successMessage: "Источник отключён." })}
          onEnable={(source) => runSourceAction(`enable-${source.id}`, () => knowledgeService.enableSource(source.id), { successMessage: "Источник снова включён." })}
          onPreview={handleOpenPreview}
          onRefresh={(source) => runSourceAction(`refresh-${source.id}`, () => knowledgeService.refreshSource(source.id), { successMessage: "Страница перечитана. Проверьте и одобрите новое содержимое." })}
          onRename={(source) => setRenameTarget({ source, title: source.title })}
          sources={pages}
          title="Страницы (URL)"
          usage={usage}
        />
      ) : null}

      {tab === "mcp" ? (
        <section className="work-panel">
          <SectionTitle
            action={
              <button disabled={!canWrite || busy} onClick={() => setMcpForm({ description: "", endpoint: "", name: "", tools: "" })} type="button">
                <Plug size={15} /> Подать заявку
              </button>
            }
            title="MCP-подключения"
          />
          <p className="scenario-settings-note">Вы регистрируете read-only MCP-сервер, администратор сервиса одобряет его, и бот сможет отвечать по данным подключения. Запись во внешние системы недоступна.</p>
          {!mcpConnectors.length ? (
            <div className="knowledge-empty">
              <Globe size={19} />
              <span>Подключений пока нет. Подайте заявку — после одобрения администратором сервиса подключение можно будет выбрать как источник знаний.</span>
            </div>
          ) : (
            <ul className="knowledge-source-list">
              {mcpConnectors.map((connector) => {
                const state = connector.approvedAt
                  ? (connector.status === "enabled" ? { label: "Одобрено и включено", tone: "ok" } : { label: "Одобрено, выключено", tone: "hold" })
                  : (connector.rejectedReason ? { label: "Отклонено", tone: "warn" } : { label: "На одобрении", tone: "info" });
                const boundSource = mcpSources.find((source) => source.sourceConfig?.connectorId === connector.id);
                return (
                  <li className="knowledge-source-row" key={connector.id}>
                    <div className="knowledge-source-main">
                      <strong>{connector.name ?? connector.endpoint}</strong>
                      <span className="knowledge-source-badges">
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                        {boundSource ? <StatusBadge tone="ok">источник создан</StatusBadge> : null}
                      </span>
                      <small>
                        {connector.endpoint} · инструменты: {(connector.tools ?? []).map((tool) => tool.name).join(", ") || "—"}
                        {connector.rejectedReason ? ` · причина: ${connector.rejectedReason}` : ""}
                      </small>
                    </div>
                    {connector.approvedAt && connector.status === "enabled" && !boundSource ? (
                      <span className="knowledge-source-actions">
                        <button
                          disabled={!canWrite || busy}
                          onClick={() => runSourceAction(`mcp-source-${connector.id}`, () => knowledgeService.createSource({
                            kind: "mcp",
                            sourceConfig: { connectorId: connector.id, tool: (connector.tools ?? [])[0]?.name },
                            title: connector.name ?? "MCP-источник"
                          }), { successMessage: "Источник из MCP создан и готов к выбору в сценариях." })}
                          type="button"
                        >
                          <Plus size={14} /> Сделать источником
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "unanswered" ? (
        <section className="work-panel">
          <SectionTitle action="из этих вопросов рождаются статьи" title="Вопросы без ответа" />
          {!openQuestions.length ? (
            <div className="knowledge-empty">
              <CheckCircle2 size={19} />
              <span>Открытых вопросов нет: на всё, что спрашивали клиенты, у бота были знания.</span>
            </div>
          ) : (
            <ul className="knowledge-question-list">
              {openQuestions.map((question) => (
                <li key={question.id}>
                  <div>
                    <p>{question.question}</p>
                    <small>
                      Спрошено {question.count} {pluralTimes(question.count)} · последний раз {formatDateTime(question.lastAskedAt)}
                      {question.scenarioId ? ` · сценарий ${question.scenarioId}` : ""}
                    </small>
                  </div>
                  <span className="knowledge-question-actions">
                    <button disabled={!canWrite || busy} onClick={() => void handleCreateArticleFromQuestion(question)} type="button">
                      <Plus size={14} /> Создать статью
                    </button>
                    <button disabled={!canWrite || busy} onClick={() => void handleDismissQuestion(question)} type="button">
                      Скрыть
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === "feedback" ? (
        <section className="work-panel">
          <SectionTitle action="оценки операторов из диалогов" title="Обратная связь по ответам бота" />
          <p className="scenario-settings-note">Знания не меняются автоматически: разберите оценку и, при необходимости, создайте или исправьте статью.</p>
          {!pendingFeedback.length ? (
            <div className="knowledge-empty">
              <CheckCircle2 size={19} />
              <span>Неразобранной обратной связи нет.</span>
            </div>
          ) : (
            <ul className="knowledge-question-list">
              {pendingFeedback.map((item) => {
                const meta = FEEDBACK_LABELS[item.outcome] ?? { label: item.outcome, tone: "info" };
                return (
                  <li key={item.feedbackId}>
                    <div>
                      <p>
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> диалог {item.conversationId}
                        {item.scenarioId ? ` · сценарий ${item.scenarioId}` : ""}
                      </p>
                      <small>
                        {item.comment ? `«${item.comment}» · ` : ""}
                        {item.citationSourceIds?.length ? `источники: ${item.citationSourceIds.join(", ")} · ` : ""}
                        {formatDateTime(item.createdAt)}
                      </small>
                    </div>
                    <span className="knowledge-question-actions">
                      <button disabled={!canWrite || busy} onClick={() => void handleArticleFromFeedback(item)} type="button">
                        <Plus size={14} /> Создать статью
                      </button>
                      <button disabled={!canWrite || busy} onClick={() => void handleResolveFeedback(item, "reviewed")} type="button">
                        Разобрано
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {previewTarget ? (
        <Modal
          eyebrow={previewTarget.source.title}
          onClose={() => setPreviewTarget(null)}
          title="Что знает бот из этого источника"
          titleId="knowledge-preview-title"
        >
          {previewTarget.loading ? <p>Загрузка...</p> : (
            <div className="knowledge-preview">
              <p className="knowledge-preview-meta">
                Фрагментов: {previewTarget.preview?.chunkCount ?? 0}
                {previewTarget.preview?.language ? ` · язык: ${previewTarget.preview.language}` : ""}
              </p>
              {normalizeList(previewTarget.preview?.chunks).map((chunk) => (
                <blockquote key={chunk.id}>{chunk.content}</blockquote>
              ))}
              {previewTarget.preview?.extractedTextPreview && !normalizeList(previewTarget.preview?.chunks).length ? (
                <blockquote>{previewTarget.preview.extractedTextPreview}</blockquote>
              ) : null}
              <div className="knowledge-preview-search">
                <input
                  onChange={(event) => setPreviewTarget((current) => current ? { ...current, query: event.target.value } : current)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handlePreviewSearch();
                    }
                  }}
                  placeholder="Проверить поиск: например, «сколько идёт доставка»"
                  type="text"
                  value={previewTarget.query ?? ""}
                />
                <button onClick={() => void handlePreviewSearch()} type="button">
                  <Search size={14} /> Найти
                </button>
              </div>
              {previewTarget.results ? (
                previewTarget.results.length ? (
                  <ul className="knowledge-preview-results">
                    {previewTarget.results.map((passage, index) => (
                      <li key={`${passage.citation?.sourceId}-${index}`}>
                        <strong>Совпадение {Math.round((passage.score ?? 0) * 100)}%</strong>
                        <span>{String(passage.content ?? "").slice(0, 220)}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="knowledge-preview-empty">Ничего не нашлось — бот на такой вопрос ответить не сможет.</p>
              ) : null}
            </div>
          )}
        </Modal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          confirmLabel="Удалить навсегда"
          danger
          description={deleteTarget.status === "archived"
            ? `Источник «${deleteTarget.title}» будет удалён без возможности восстановления.`
            : `Источник «${deleteTarget.title}» сначала будет перемещён в архив, затем удалён навсегда.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            const target = deleteTarget;
            setDeleteTarget(null);
            if (target.status !== "archived") {
              const archived = await runSourceAction(`archive-${target.id}`, () => knowledgeService.archiveSource(target.id));
              if (!archived) return;
            }
            await runSourceAction(`delete-${target.id}`, () => knowledgeService.deleteSource(target.id), { successMessage: "Источник удалён." });
          }}
          title={`Удалить «${deleteTarget.title}»?`}
        />
      ) : null}

      {urlForm ? (
        <ConfirmDialog
          confirmLabel="Добавить"
          onCancel={() => setUrlForm(null)}
          onConfirm={() => void handleCreateUrlSource()}
          title="Добавить URL-страницу"
        >
          <span className="knowledge-url-form">
            <label>
              <span>HTTPS-адрес страницы</span>
              <input autoFocus onChange={(event) => setUrlForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://docs.example.com/faq" type="url" value={urlForm.url} />
            </label>
            <label>
              <span>Название источника</span>
              <input onChange={(event) => setUrlForm((current) => ({ ...current, title: event.target.value }))} placeholder="FAQ по доставке" type="text" value={urlForm.title} />
            </label>
          </span>
        </ConfirmDialog>
      ) : null}

      {articleSourceForm ? (
        <ConfirmDialog
          confirmLabel="Создать источник"
          onCancel={() => setArticleSourceForm(null)}
          onConfirm={() => void handleCreateArticleSource()}
          title="Источник из статьи"
        >
          <span className="knowledge-url-form">
            <label>
              <span>Опубликованная статья</span>
              <select autoFocus onChange={(event) => setArticleSourceForm({ articleId: event.target.value })} value={articleSourceForm.articleId}>
                <option value="">Выберите статью…</option>
                {articles.filter((article) => String(article.status).toLowerCase().includes("publish") || article.status === "Опубликована").map((article) => (
                  <option key={article.id} value={article.id}>{article.title}</option>
                ))}
              </select>
            </label>
          </span>
        </ConfirmDialog>
      ) : null}

      {mcpForm ? (
        <ConfirmDialog
          confirmLabel="Отправить заявку"
          onCancel={() => setMcpForm(null)}
          onConfirm={() => void handleRequestMcp()}
          title="Заявка на MCP-подключение"
        >
          <span className="knowledge-url-form">
            <label>
              <span>Название</span>
              <input autoFocus onChange={(event) => setMcpForm((current) => ({ ...current, name: event.target.value }))} placeholder="Каталог заказов" type="text" value={mcpForm.name} />
            </label>
            <label>
              <span>HTTPS-адрес MCP-сервера</span>
              <input onChange={(event) => setMcpForm((current) => ({ ...current, endpoint: event.target.value }))} placeholder="https://mcp.example.com/rpc" type="url" value={mcpForm.endpoint} />
            </label>
            <label>
              <span>Read-only инструменты (через запятую)</span>
              <input onChange={(event) => setMcpForm((current) => ({ ...current, tools: event.target.value }))} placeholder="order_status, catalog_lookup" type="text" value={mcpForm.tools} />
            </label>
            <label>
              <span>Зачем нужно подключение (необязательно)</span>
              <textarea onChange={(event) => setMcpForm((current) => ({ ...current, description: event.target.value }))} rows={2} value={mcpForm.description} />
            </label>
          </span>
        </ConfirmDialog>
      ) : null}

      {renameTarget ? (
        <ConfirmDialog
          confirmLabel="Сохранить"
          onCancel={() => setRenameTarget(null)}
          onConfirm={async () => {
            const target = renameTarget;
            setRenameTarget(null);
            await runSourceAction(`rename-${target.source.id}`, () => knowledgeService.updateSource(target.source.id, { title: target.title }), { successMessage: "Название обновлено." });
          }}
          title="Переименовать источник"
        >
          <span className="knowledge-url-form">
            <label>
              <span>Название источника</span>
              <input autoFocus onChange={(event) => setRenameTarget((current) => ({ ...current, title: event.target.value }))} type="text" value={renameTarget.title} />
            </label>
          </span>
        </ConfirmDialog>
      ) : null}
    </ProductScreen>
  );
}

function SourceManagerPanel({ actions, busyAction, canWrite, emptyMessage, onApprove, onArchive, onDelete, onDisable, onEnable, onPreview, onRefresh, onRename, sources, title, usage }) {
  return (
    <section className="work-panel">
      <SectionTitle action={<span className="knowledge-panel-actions">{actions}</span>} title={title} />
      {!sources.length ? (
        <div className="knowledge-empty">
          <FileText size={19} />
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <ul className="knowledge-source-list">
          {sources.map((source) => {
            const statusMeta = SOURCE_STATUS_LABELS[source.status] ?? { label: source.status, tone: "info" };
            const sourceUsage = usage[source.id] ?? [];
            const rowBusy = busyAction.endsWith(source.id);
            const articleOutdated = Boolean(source.metadata?.pendingArticleVersion);
            return (
              <li className="knowledge-source-row" key={source.id}>
                <div className="knowledge-source-main">
                  <strong>{source.title}</strong>
                  <span className="knowledge-source-badges">
                    <StatusBadge tone={statusMeta.tone}>{statusMeta.label}</StatusBadge>
                    {buildSourceBotHints(source, sourceUsage).map((hint) => (
                      <span className="knowledge-source-hint" key={hint.id} title={hint.title}>
                        <StatusBadge tone={hint.tone}>{hint.label}</StatusBadge>
                      </span>
                    ))}
                    {articleOutdated ? <StatusBadge tone="warn">статья обновилась</StatusBadge> : null}
                  </span>
                  <small>
                    {sourceUsage.length
                      ? `Используется в сценариях: ${sourceUsage.map((item) => item.name).join(", ")}`
                      : "Не привязан к сценариям"}
                    {source.lastIndexedAt ? ` · индексация: ${formatDateTime(source.lastIndexedAt)}` : ""}
                    {source.failureCode ? ` · ошибка: ${source.failureCode}` : ""}
                  </small>
                </div>
                <span className="knowledge-source-actions">
                  <button disabled={rowBusy} onClick={() => onPreview(source)} title="Предпросмотр и проверка поиска" type="button">
                    <Eye size={14} />
                  </button>
                  <button disabled={!canWrite || rowBusy} onClick={() => onRename(source)} title="Переименовать" type="button">
                    <Pencil size={14} />
                  </button>
                  {source.status !== "archived" ? (
                    <button disabled={!canWrite || rowBusy} onClick={() => onRefresh(source)} title={articleOutdated ? "Статья обновилась — переиндексировать" : "Обновить и переиндексировать"} type="button">
                      <RefreshCw size={14} />
                    </button>
                  ) : null}
                  {source.status === "ready" && source.approvalStatus === "pending" ? (
                    <button disabled={!canWrite || rowBusy} onClick={() => onApprove(source)} title="Одобрить для ответов" type="button">
                      <CheckCircle2 size={14} />
                    </button>
                  ) : null}
                  {source.status === "disabled" ? (
                    <button disabled={!canWrite || rowBusy} onClick={() => onEnable(source)} title="Включить" type="button">
                      Вкл
                    </button>
                  ) : source.status !== "archived" ? (
                    <button disabled={!canWrite || rowBusy} onClick={() => onDisable(source)} title="Отключить" type="button">
                      Выкл
                    </button>
                  ) : null}
                  {source.status !== "archived" ? (
                    <button disabled={!canWrite || rowBusy} onClick={() => onArchive(source)} title="В архив" type="button">
                      <Archive size={14} />
                    </button>
                  ) : null}
                  <button className="danger" disabled={!canWrite || rowBusy} onClick={() => onDelete(source)} title="Удалить" type="button">
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function UploadButton({ busy, canWrite, onUpload }) {
  const inputRef = useRef(null);
  return (
    <>
      <button disabled={!canWrite || busy} onClick={() => inputRef.current?.click()} title="TXT, Markdown или HTML" type="button">
        <Upload size={15} /> Загрузить файл
      </button>
      <input
        accept=".txt,.md,.markdown,.html,.htm,text/plain,text/markdown,text/html"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void onUpload(file);
        }}
        ref={inputRef}
        type="file"
      />
    </>
  );
}

function buildKnowledgeUpload(file) {
  const id = `ks-doc-${file.name}-${file.lastModified}-${Date.now()}`;
  const attachment = {
    channel: "SDK",
    id,
    idempotencyKey: `knowledge-upload:${id}`,
    mimeType: file.type || "text/plain",
    name: file.name,
    sizeBytes: file.size,
    status: "uploading"
  };
  Object.defineProperty(attachment, "file", { enumerable: false, value: file, writable: false });
  return attachment;
}

function splitTopicsInput(value) {
  return String(value ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function pluralTimes(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "раз";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "раза";
  return "раз";
}

function formatDateTime(value) {
  const parsed = Date.parse(String(value ?? ""));
  if (Number.isNaN(parsed)) return String(value ?? "—");
  return new Date(parsed).toLocaleString("ru-RU", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit" });
}
