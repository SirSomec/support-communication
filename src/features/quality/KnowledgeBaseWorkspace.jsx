import React, { useMemo, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  FileText,
  History,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import {
  addKnowledgeArticleAttachment,
  archiveKnowledgeArticle,
  deleteKnowledgeArticleAttachment,
  publishKnowledgeArticle,
  submitKnowledgeArticleDraft,
  submitKnowledgeArticleForReview
} from "../../app/knowledgeArticleActions.js";
import { knowledgeService } from "../../services/knowledgeService.js";
import "./knowledge-base.css";

const articleChannels = ["SDK", "Telegram", "MAX", "VK"];
const visibilityOptions = [
  { value: "public", label: "Видна клиентам" },
  { value: "internal", label: "Только сотрудникам" }
];
const statusLabels = {
  approved: "Одобрена",
  archived: "В архиве",
  draft: "Черновик",
  published: "Опубликована",
  review: "На проверке"
};

function statusKey(status) {
  return Object.hasOwn(statusLabels, status) ? status : "draft";
}

function statusLabel(status) {
  return statusLabels[statusKey(status)];
}

function createArticleDraft(article) {
  return {
    ...article,
    approvalHistory: article.approvalHistory ?? [],
    attachments: article.attachments ?? [],
    body: article.body ?? "",
    category: article.category ?? "Общее",
    channels: article.channels ?? ["SDK"],
    topics: article.topics ?? [],
    versions: article.versions ?? [],
    visibility: article.visibility ?? "internal"
  };
}

function resolveKnowledgeActor(operator) {
  return String(operator?.id ?? operator?.email ?? operator?.name ?? "knowledge-editor").trim() || "knowledge-editor";
}

function formatFileSize(bytes = 0) {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return "0 Б";
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function formatUpdated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "недавно";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" }).format(date);
}

export function KnowledgeBaseWorkspace({ articles, canWrite = false, onToast, operator }) {
  const attachmentInputRef = useRef(null);
  const [articleDrafts, setArticleDrafts] = useState(() => Object.fromEntries(articles.map((article) => [article.id, createArticleDraft(article)])));
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [articleToArchive, setArticleToArchive] = useState(null);

  const allArticles = Object.values(articleDrafts);
  const selectedArticle = articleDrafts[selectedArticleId] ?? allArticles[0] ?? null;
  const actor = resolveKnowledgeActor(operator);
  const workflowBusy = Boolean(pendingAction);
  const visibleArticles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return allArticles.filter((article) => {
      const status = statusKey(article.status);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" && status !== "archived") || status === statusFilter;
      const searchable = `${article.title} ${article.category} ${(article.topics ?? []).join(" ")}`.toLocaleLowerCase();
      return matchesStatus && (!needle || searchable.includes(needle));
    });
  }, [allArticles, query, statusFilter]);

  function toast(message) {
    onToast?.(message);
  }

  function updateSelectedArticle(field, value) {
    if (!selectedArticle) return;
    setArticleDrafts((current) => ({ ...current, [selectedArticle.id]: { ...current[selectedArticle.id], [field]: value } }));
  }

  function toggleArticleChannel(channel) {
    const channels = selectedArticle.channels.includes(channel)
      ? selectedArticle.channels.filter((item) => item !== channel)
      : [...selectedArticle.channels, channel];
    updateSelectedArticle("channels", channels);
  }

  function saveArticle(article) {
    const saved = createArticleDraft(article);
    setArticleDrafts((current) => ({ ...current, [saved.id]: saved }));
    setSelectedArticleId(saved.id);
    return saved;
  }

  async function createNewArticle() {
    if (!canWrite || workflowBusy) return;
    setPendingAction("create");
    const response = await knowledgeService.createArticle({ body: "", category: "Общее", channels: ["SDK"], title: "Новая статья", topics: [], visibility: "internal" });
    setPendingAction("");
    if (response.status !== "ok" || !response.data?.article) {
      toast(response.error?.message ?? "Не удалось создать статью.");
      return;
    }
    saveArticle(response.data.article);
    setShowDetails(false);
    toast("Создан черновик новой статьи.");
  }

  async function saveDraft() {
    if (!selectedArticle || savingDraft || workflowBusy) return;
    setSavingDraft(true);
    const result = await submitKnowledgeArticleDraft(selectedArticle);
    setSavingDraft(false);
    if (!result.ok) {
      toast(result.message);
      return;
    }
    saveArticle(result.article);
    toast("Черновик сохранён.");
  }

  async function publishNow() {
    if (!selectedArticle || workflowBusy || savingDraft) return;
    setPendingAction("publish");
    const draft = await submitKnowledgeArticleDraft(selectedArticle);
    if (!draft.ok) {
      setPendingAction("");
      toast(draft.message);
      return;
    }
    const review = await submitKnowledgeArticleForReview(createArticleDraft(draft.article), { actor });
    if (!review.ok) {
      setPendingAction("");
      toast(review.message);
      return;
    }
    const published = await publishKnowledgeArticle(createArticleDraft(review.article), { actor });
    setPendingAction("");
    if (!published.ok) {
      toast(published.message);
      return;
    }
    saveArticle(published.article);
    toast("Статья опубликована.");
  }

  async function archiveArticle() {
    if (!articleToArchive || workflowBusy) return;
    const article = articleToArchive;
    setArticleToArchive(null);
    setPendingAction("archive");
    const result = await archiveKnowledgeArticle(article, { actor });
    setPendingAction("");
    if (!result.ok) {
      toast(result.message);
      return;
    }
    const next = allArticles.find((item) => item.id !== article.id && statusKey(item.status) !== "archived");
    setArticleDrafts((current) => ({ ...current, [article.id]: createArticleDraft(result.article) }));
    setSelectedArticleId(next?.id ?? article.id);
    toast("Статья перенесена в архив.");
  }

  async function addAttachment(file) {
    if (!file || !selectedArticle || workflowBusy) return;
    setPendingAction("attachment-add");
    const result = await addKnowledgeArticleAttachment(selectedArticle, {
      name: file.name,
      size: formatFileSize(file.size),
      sizeBytes: file.size,
      status: "scan_pending",
      type: file.type || "Файл"
    }, { actor });
    setPendingAction("");
    if (!result.ok) {
      toast(result.message);
      return;
    }
    saveArticle(result.article);
    toast("Вложение добавлено и ожидает проверки.");
  }

  async function deleteAttachment(attachment) {
    if (!selectedArticle || workflowBusy) return;
    setPendingAction(`attachment:${attachment.id}`);
    const result = await deleteKnowledgeArticleAttachment(selectedArticle, attachment, { actor });
    setPendingAction("");
    if (!result.ok) {
      toast(result.message);
      return;
    }
    saveArticle(result.article);
    toast("Вложение удалено.");
  }

  if (!selectedArticle) {
    return <div className="knowledge-empty-state"><p>Статей базы знаний пока нет.</p><button className="primary-action" disabled={!canWrite || workflowBusy} onClick={() => void createNewArticle()} type="button"><Plus size={16} /> Новая статья</button></div>;
  }

  return (
    <div className="knowledge-workspace article-manager">
      <header className="article-manager-header">
        <div><h2>Статьи</h2><span>{allArticles.length} статей</span></div>
        <button className="primary-action" disabled={!canWrite || workflowBusy} onClick={() => void createNewArticle()} type="button"><Plus size={17} /> Новая статья</button>
      </header>

      <div className="article-manager-layout">
        <aside className="knowledge-table" aria-label="Список статей">
          <div className="article-list-tools">
            <label className="article-search"><Search size={17} /><input aria-label="Поиск статей" onChange={(event) => setQuery(event.target.value)} placeholder="Поиск статей" value={query} /></label>
            <label className="article-filter"><SlidersHorizontal size={16} /><select aria-label="Статус статей" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="active">Активные</option><option value="all">Все статусы</option><option value="published">Опубликованные</option><option value="draft">Черновики</option><option value="review">На проверке</option><option value="archived">Архив</option></select></label>
          </div>
          <div className="article-list">
            {visibleArticles.map((article) => <button className={`knowledge-row ${selectedArticle.id === article.id ? "selected" : ""}`} key={article.id} onClick={() => setSelectedArticleId(article.id)} type="button"><strong>{article.title || "Без названия"}</strong><span className={`article-status ${statusKey(article.status)}`}><i />{statusLabel(article.status)}</span><small>Обновлено {formatUpdated(article.updated)}</small><MoreHorizontal aria-hidden="true" size={19} /></button>)}
            {!visibleArticles.length ? <p className="article-list-empty">Ничего не найдено</p> : null}
          </div>
        </aside>

        <main className="knowledge-editor">
          <div className="article-editor-topbar"><span className={`article-status ${statusKey(selectedArticle.status)}`}><i />{statusLabel(selectedArticle.status)}</span><button aria-expanded={showDetails} className="article-details-toggle" onClick={() => setShowDetails((current) => !current)} type="button"><Settings2 size={16} /> Настройки <ChevronDown size={15} /></button></div>
          <div className="knowledge-editor-form"><input aria-label="Название статьи" className="article-title-input" disabled={!canWrite} placeholder="Название статьи" value={selectedArticle.title} onChange={(event) => updateSelectedArticle("title", event.target.value)} /><label className="article-body-label"><span>Текст статьи</span><textarea disabled={!canWrite} placeholder="Начните писать…" value={selectedArticle.body} onChange={(event) => updateSelectedArticle("body", event.target.value)} /></label></div>

          {showDetails ? <section className="article-details-panel" aria-label="Настройки статьи"><label><span>Категория</span><input disabled={!canWrite} value={selectedArticle.category} onChange={(event) => updateSelectedArticle("category", event.target.value)} /></label><label><span>Доступ</span><select disabled={!canWrite} value={selectedArticle.visibility} onChange={(event) => updateSelectedArticle("visibility", event.target.value)}>{visibilityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="article-details-channels"><span>Показывать в</span>{articleChannels.map((channel) => <button aria-pressed={selectedArticle.channels.includes(channel)} className={selectedArticle.channels.includes(channel) ? "active" : ""} disabled={!canWrite} key={channel} onClick={() => toggleArticleChannel(channel)} type="button">{channel}</button>)}</div><div className="article-details-links"><button onClick={() => setShowHistory((current) => !current)} type="button"><History size={15} /> История версий</button><button disabled={!canWrite || workflowBusy} onClick={() => attachmentInputRef.current?.click()} type="button"><Paperclip size={15} /> Вложения ({selectedArticle.attachments.length})</button></div><input ref={attachmentInputRef} className="knowledge-file-input" onChange={(event) => { const [file] = Array.from(event.target.files ?? []); event.target.value = ""; void addAttachment(file); }} type="file" />{showHistory ? <div className="article-history">{selectedArticle.versions.slice(0, 3).map((version) => <button key={version.id} type="button"><strong>{version.label}</strong><span>{statusLabel(version.status)} · {version.author}</span></button>)}</div> : null}{selectedArticle.attachments.length ? <div className="knowledge-attachment-list">{selectedArticle.attachments.map((attachment) => <article key={attachment.id}><FileText size={17} /><div><strong>{attachment.name}</strong><span>{attachment.type} · {attachment.size}</span></div><button aria-label={`Удалить ${attachment.name}`} disabled={!canWrite || workflowBusy} onClick={() => void deleteAttachment(attachment)} type="button"><X size={15} /></button></article>)}</div> : null}</section> : null}

          <footer className="article-editor-actions"><button className="danger-action" disabled={!canWrite || workflowBusy || statusKey(selectedArticle.status) === "archived"} onClick={() => setArticleToArchive(selectedArticle)} type="button"><Trash2 size={16} /> Удалить</button><div><button disabled={!canWrite || savingDraft || workflowBusy} onClick={() => void saveDraft()} type="button"><Pencil size={16} /> {savingDraft ? "Сохранение…" : "Сохранить черновик"}</button><button className="primary-action" disabled={!canWrite || workflowBusy || statusKey(selectedArticle.status) === "archived"} onClick={() => void publishNow()} type="button"><ShieldCheck size={16} /> {pendingAction === "publish" ? "Публикуем…" : "Опубликовать"}</button></div></footer>
        </main>
      </div>

      {articleToArchive ? <div className="article-confirm-backdrop" role="presentation"><section aria-describedby="archive-article-description" aria-labelledby="archive-article-title" className="article-confirm" role="dialog"><Archive size={22} /><h3 id="archive-article-title">Удалить статью?</h3><p id="archive-article-description">«{articleToArchive.title}» будет перенесена в архив и исчезнет из активного списка. Её можно будет найти через фильтр «Архив».</p><footer><button onClick={() => setArticleToArchive(null)} type="button">Отмена</button><button className="danger-action" disabled={workflowBusy} onClick={() => void archiveArticle()} type="button">Удалить</button></footer></section></div> : null}
    </div>
  );
}
