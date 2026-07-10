import React, { useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileText,
  History,
  Paperclip,
  Pencil,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  X
} from "lucide-react";
import {
  addKnowledgeArticleAttachment,
  archiveKnowledgeArticle,
  deleteKnowledgeArticleAttachment,
  publishKnowledgeArticle,
  rejectKnowledgeArticle,
  submitKnowledgeArticleDraft,
  submitKnowledgeArticleForReview
} from "../../app/knowledgeArticleActions.js";
import { ChannelList, SegmentedControl, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import "./knowledge-base.css";

const articleChannels = ["SDK", "Telegram", "MAX", "VK"];
const previewModes = [
  { value: "operator", label: "Оператор" },
  { value: "self-service", label: "Self-service" }
];
const visibilityOptions = [
  { value: "public", label: "Публичная" },
  { value: "internal", label: "Только оператор" }
];
const statusTone = {
  approved: "ok",
  archived: "warn",
  draft: "info",
  published: "ok",
  review: "hold",
  "Опубликована": "ok",
  "На проверке": "hold",
  "Черновик": "info"
};

function isPublishedArticle(article) {
  return article.status === "published" || article.status === "Опубликована";
}

function isReviewableArticle(article) {
  return article.status === "draft" || article.status === "Р§РµСЂРЅРѕРІРёРє";
}

function isPublishableArticle(article) {
  return article.status === "review" || article.status === "approved" || article.status === "РќР° РїСЂРѕРІРµСЂРєРµ";
}

function createArticleDraft(article) {
  return {
    ...article,
    body: article.body ?? `${article.title}: актуальная инструкция для операторов и self-service. Свяжите статью с тематикой ${article.topics.join(", ")} и проверьте формулировки перед публикацией.`,
    visibility: article.visibility ?? "public",
    attachments: article.attachments ?? [],
    versions: article.versions ?? [],
    approvalHistory: article.approvalHistory ?? []
  };
}

function createApprovalEvent(article, action, comment, tone) {
  return {
    id: `${article.id}-${action}-${article.approvalHistory.length + 1}`,
    actor: "Текущий пользователь",
    role: action === "Опубликовал" ? "Старший сотрудник" : "Автор",
    action,
    date: "Только что",
    comment,
    tone
  };
}

function getWidgetArticles(articles, query) {
  const normalizedQuery = query.trim().toLowerCase();

  return Object.values(articles).filter((article) => {
    if (article.visibility !== "public" || !isPublishedArticle(article)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return `${article.title} ${article.category} ${article.topics.join(" ")} ${article.body}`.toLowerCase().includes(normalizedQuery);
  });
}

function resolveKnowledgeActor(operator) {
  return String(operator?.id ?? operator?.email ?? operator?.name ?? "knowledge-editor").trim() || "knowledge-editor";
}

function formatFileSize(bytes = 0) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  if (size < 1024) {
    return `${Math.round(size)} B`;
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function KnowledgeBaseWorkspace({ articles, onToast, operator }) {
  const attachmentInputRef = useRef(null);
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [articleDrafts, setArticleDrafts] = useState(() =>
    Object.fromEntries(articles.map((article) => [article.id, createArticleDraft(article)]))
  );
  const [selectedVersionByArticle, setSelectedVersionByArticle] = useState(() =>
    Object.fromEntries(articles.map((article) => [article.id, article.versions?.[0]?.id ?? "current"]))
  );
  const [previewMode, setPreviewMode] = useState("operator");
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [widgetQuery, setWidgetQuery] = useState("");

  const selectedArticle = articleDrafts[selectedArticleId] ?? Object.values(articleDrafts)[0];
  const selectedVersionId = selectedVersionByArticle[selectedArticle.id] ?? selectedArticle.versions[0]?.id;
  const selectedVersion = selectedArticle.versions.find((version) => version.id === selectedVersionId) ?? selectedArticle.versions[0];
  const selectedArticleIsPublished = selectedArticle.visibility === "public" && isPublishedArticle(selectedArticle);
  const widgetArticles = useMemo(() => getWidgetArticles(articleDrafts, widgetQuery), [articleDrafts, widgetQuery]);
  const actor = resolveKnowledgeActor(operator);
  const workflowBusy = Boolean(pendingAction);

  function updateSelectedArticle(updater) {
    setArticleDrafts((current) => ({
      ...current,
      [selectedArticle.id]: updater(current[selectedArticle.id])
    }));
  }

  function updateArticleDraft(field, value) {
    updateSelectedArticle((article) => ({
      ...article,
      [field]: value
    }));
  }

  function toggleArticleChannel(channel) {
    const nextChannels = selectedArticle.channels.includes(channel)
      ? selectedArticle.channels.filter((item) => item !== channel)
      : [...selectedArticle.channels, channel];

    updateArticleDraft("channels", nextChannels);
  }

  function selectArticle(articleId) {
    setSelectedArticleId(articleId);
  }

  function selectVersion(versionId) {
    setSelectedVersionByArticle((current) => ({
      ...current,
      [selectedArticle.id]: versionId
    }));
  }

  function upsertSavedArticle(article) {
    const savedArticle = createArticleDraft(article);
    const nextVersionId = savedArticle.versions[0]?.id ?? "current";

    setArticleDrafts((current) => ({
      ...current,
      [savedArticle.id]: savedArticle
    }));
    setSelectedVersionByArticle((current) => ({
      ...current,
      [savedArticle.id]: nextVersionId
    }));

    return savedArticle;
  }

  async function runGovernanceAction(actionKey, requestAction, successMessage) {
    if (workflowBusy) {
      return;
    }

    const articleAtStart = selectedArticle;
    setPendingAction(actionKey);
    const result = await requestAction(articleAtStart, {
      actor,
      draftId: selectedVersionId
    });
    setPendingAction("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const savedArticle = upsertSavedArticle(result.article);
    onToast(successMessage(savedArticle));
  }

  async function deleteAttachment(attachment) {
    if (workflowBusy) {
      return;
    }

    const articleAtStart = selectedArticle;
    setPendingAction(`attachment:delete:${attachment.id}`);
    const result = await deleteKnowledgeArticleAttachment(articleAtStart, attachment, { actor });
    setPendingAction("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const savedArticle = upsertSavedArticle(result.article);
    onToast(`${savedArticle.title}: вложение удалено в backend.`);
  }

  async function addAttachmentFromFile(file) {
    if (!file || workflowBusy) {
      return;
    }

    const articleAtStart = selectedArticle;
    setPendingAction("attachment:add");
    const result = await addKnowledgeArticleAttachment(
      articleAtStart,
      {
        name: file.name,
        size: formatFileSize(file.size),
        sizeBytes: file.size,
        status: "scan_pending",
        scanState: "scan_pending",
        type: file.type || file.name.split(".").at(-1)?.toUpperCase() || "FILE"
      },
      { actor }
    );
    setPendingAction("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const savedArticle = upsertSavedArticle(result.article);
    onToast(`${savedArticle.title}: вложение добавлено и ожидает проверки.`);
  }

  async function saveDraftVersion() {
    if (savingDraft) {
      return;
    }

    setSavingDraft(true);
    const result = await submitKnowledgeArticleDraft(selectedArticle);
    setSavingDraft(false);

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    const savedArticle = createArticleDraft({
      ...selectedArticle,
      ...result.article,
      approvalHistory: [
        createApprovalEvent(selectedArticle, "Сохранил версию", result.auditEvent?.reason ?? "Backend сохранил черновик статьи.", "info"),
        ...(result.article.approvalHistory ?? selectedArticle.approvalHistory)
      ]
    });
    const nextVersionId = savedArticle.versions[0]?.id ?? "current";

    setArticleDrafts((current) => ({
      ...current,
      [savedArticle.id]: savedArticle
    }));
    setSelectedVersionByArticle((current) => ({
      ...current,
      [savedArticle.id]: nextVersionId
    }));
    onToast(`${savedArticle.title}: черновик сохранен в backend.`);
  }

  return (
    <div className="knowledge-workspace">
      <div className="knowledge-table">
        {Object.values(articleDrafts).map((article) => (
          <button
            className={`knowledge-row ${selectedArticle.id === article.id ? "selected" : ""}`}
            key={article.id}
            onClick={() => selectArticle(article.id)}
            type="button"
          >
            <strong>{article.title}</strong>
            <span>{article.category}</span>
            <span>{article.status}</span>
            <ChannelList channels={article.channels} />
            <b>{article.helpfulRate}% полезность</b>
          </button>
        ))}
      </div>

      <div className="knowledge-editor">
        <div className="knowledge-editor-form">
          <label>
            <span>Название</span>
            <input value={selectedArticle.title} onChange={(event) => updateArticleDraft("title", event.target.value)} />
          </label>
          <div className="knowledge-form-grid">
            <label>
              <span>Статус</span>
              <select disabled title="Статус статьи меняется через workflow-кнопки ниже." value={selectedArticle.status} onChange={(event) => updateArticleDraft("status", event.target.value)}>
                <option>Черновик</option>
                <option>На проверке</option>
                <option>Опубликована</option>
              </select>
            </label>
            <label>
              <span>Видимость</span>
              <select value={selectedArticle.visibility} onChange={(event) => updateArticleDraft("visibility", event.target.value)}>
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>Текст статьи</span>
            <textarea value={selectedArticle.body} onChange={(event) => updateArticleDraft("body", event.target.value)} />
          </label>
          <div className="knowledge-channel-picker" aria-label="Каналы статьи">
            {articleChannels.map((channel) => (
              <button
                aria-pressed={selectedArticle.channels.includes(channel)}
                className={selectedArticle.channels.includes(channel) ? "active" : ""}
                key={channel}
                onClick={() => toggleArticleChannel(channel)}
                type="button"
              >
                {channel}
              </button>
            ))}
          </div>
          <footer>
            <button disabled={savingDraft || workflowBusy} onClick={() => void saveDraftVersion()} type="button">
              <Pencil size={16} />
              {savingDraft ? "Сохранение..." : "Сохранить"}
            </button>
            <button className="primary-action" disabled={workflowBusy || !isReviewableArticle(selectedArticle)} onClick={() => void runGovernanceAction("submit-review", submitKnowledgeArticleForReview, (article) => `${article.title}: статья отправлена на проверку.`)} title={isReviewableArticle(selectedArticle) ? "Отправить статью на проверку" : "Статья должна быть в черновике"} type="button">
              <CheckCircle2 size={16} />
              На проверку
            </button>
            <button disabled={workflowBusy || !isPublishableArticle(selectedArticle)} onClick={() => void runGovernanceAction("publish", publishKnowledgeArticle, (article) => `${article.title}: статья опубликована.`)} title={isPublishableArticle(selectedArticle) ? "Опубликовать статью" : "Сначала отправьте статью на проверку"} type="button">
              <ShieldCheck size={16} />
              Опубликовать
            </button>
            <button disabled={workflowBusy || !isPublishableArticle(selectedArticle)} onClick={() => void runGovernanceAction("reject", rejectKnowledgeArticle, (article) => `${article.title}: статья возвращена на доработку.`)} title={isPublishableArticle(selectedArticle) ? "Вернуть статью на доработку" : "Возврат доступен только на проверке"} type="button">
              <RotateCcw size={16} />
              На доработку
            </button>
            <button disabled={workflowBusy || !isPublishedArticle(selectedArticle)} onClick={() => void runGovernanceAction("archive", archiveKnowledgeArticle, (article) => `${article.title}: статья перенесена в архив.`)} title={isPublishedArticle(selectedArticle) ? "Перенести статью в архив" : "Архив доступен только для опубликованной статьи"} type="button">
              <X size={16} />
              В архив
            </button>
          </footer>
        </div>

        <div className="knowledge-preview-stack">
          <div className="knowledge-preview-toolbar">
            <SegmentedControl ariaLabel="Режим предпросмотра базы знаний" onChange={setPreviewMode} options={previewModes} value={previewMode} />
          </div>

          {previewMode === "operator" ? (
            <article className="knowledge-preview">
              <span>{selectedArticle.category} · {selectedArticle.status} · {selectedArticle.version}</span>
              <h3>{selectedArticle.title}</h3>
              <p>{selectedArticle.body}</p>
              <ChannelList channels={selectedArticle.channels} />
              <small>Тематики: {selectedArticle.topics.join(", ")} · полезность {selectedArticle.helpfulRate}%</small>
            </article>
          ) : (
            <article className="knowledge-preview knowledge-self-service-preview">
              <header>
                <strong>Помощь</strong>
                <span>{selectedArticle.channels.includes("SDK") ? "SDK widget" : selectedArticle.channels[0]}</span>
              </header>
              <ToolbarSearch
                ariaLabel="Поиск по self-service"
                onChange={setWidgetQuery}
                placeholder="Найти ответ до обращения"
                value={widgetQuery}
              />
              <div className="knowledge-widget-results">
                {widgetArticles.slice(0, 3).map((article) => (
                  <button
                    className={article.id === selectedArticle.id ? "selected" : ""}
                    key={article.id}
                    onClick={() => selectArticle(article.id)}
                    type="button"
                  >
                    <strong>{article.title}</strong>
                    <span>{article.status} · {article.category}</span>
                  </button>
                ))}
                {!widgetArticles.length ? <p>Публичные статьи не найдены. Клиенту будет предложен переход к оператору.</p> : null}
              </div>
              <footer>
                <button type="button">Написать оператору</button>
                <small>{selectedArticleIsPublished ? "Текущая статья доступна клиенту" : "Текущая статья скрыта до публикации"}</small>
              </footer>
            </article>
          )}
        </div>
      </div>

      <div className="knowledge-governance-grid">
        <section className="knowledge-governance-panel">
          <header>
            <History size={17} />
            <strong>Версии статьи</strong>
            <StatusBadge tone={statusTone[selectedArticle.status] ?? "info"}>{selectedArticle.status}</StatusBadge>
          </header>
          <div className="knowledge-version-list">
            {selectedArticle.versions.map((version) => (
              <button
                className={selectedVersion?.id === version.id ? "selected" : ""}
                key={version.id}
                onClick={() => selectVersion(version.id)}
                type="button"
              >
                <span>{version.label}</span>
                <strong>{version.status}</strong>
                <small>{version.updated} · {version.author}</small>
              </button>
            ))}
          </div>
          {selectedVersion ? (
            <p className="knowledge-version-note">
              {selectedVersion.label}: {selectedVersion.changes}
            </p>
          ) : null}
        </section>

        <section className="knowledge-governance-panel">
          <header>
            <Paperclip size={17} />
            <strong>Вложения</strong>
            <button disabled={workflowBusy} onClick={() => attachmentInputRef.current?.click()} title="Добавить вложение к статье" type="button"><UploadCloud size={15} /> Добавить</button>
            <input
              ref={attachmentInputRef}
              className="knowledge-file-input"
              onChange={(event) => {
                const [file] = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addAttachmentFromFile(file);
              }}
              type="file"
            />
          </header>
          <div className="knowledge-attachment-list">
            {selectedArticle.attachments.map((attachment) => (
              <article key={attachment.id}>
                <FileText size={17} />
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.type} · {attachment.size}</span>
                </div>
                <button aria-label={`Удалить ${attachment.name}`} disabled={workflowBusy} onClick={() => void deleteAttachment(attachment)} title="Удалить вложение" type="button">
                  <X size={15} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="knowledge-governance-panel knowledge-approval-panel">
          <header>
            <ShieldCheck size={17} />
            <strong>Approval history</strong>
            <span>{selectedArticle.approvalHistory.length} событий</span>
          </header>
          <div className="knowledge-approval-list">
            {selectedArticle.approvalHistory.map((event) => (
              <article className={event.tone} key={event.id}>
                <i />
                <div>
                  <strong>{event.action}</strong>
                  <span>{event.actor} · {event.role} · {event.date}</span>
                  <p>{event.comment}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
