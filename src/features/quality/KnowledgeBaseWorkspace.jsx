import React, { useMemo, useState } from "react";
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
  "Опубликована": "ok",
  "На проверке": "hold",
  "Черновик": "info"
};

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

function createNextVersion(article) {
  const nextIndex = article.versions.length + 1;

  return {
    id: `${article.id}-draft-${nextIndex}`,
    label: `${article.version ?? "v1.0"} draft ${nextIndex}`,
    status: "Черновик",
    author: article.owner,
    updated: "Только что",
    changes: "Сохранены изменения из редактора статьи."
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
    if (article.visibility !== "public" || article.status !== "Опубликована") {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return `${article.title} ${article.category} ${article.topics.join(" ")} ${article.body}`.toLowerCase().includes(normalizedQuery);
  });
}

export function KnowledgeBaseWorkspace({ articles, onToast }) {
  const [selectedArticleId, setSelectedArticleId] = useState(articles[0]?.id ?? "");
  const [articleDrafts, setArticleDrafts] = useState(() =>
    Object.fromEntries(articles.map((article) => [article.id, createArticleDraft(article)]))
  );
  const [selectedVersionByArticle, setSelectedVersionByArticle] = useState(() =>
    Object.fromEntries(articles.map((article) => [article.id, article.versions?.[0]?.id ?? "current"]))
  );
  const [previewMode, setPreviewMode] = useState("operator");
  const [widgetQuery, setWidgetQuery] = useState("");

  const selectedArticle = articleDrafts[selectedArticleId] ?? Object.values(articleDrafts)[0];
  const selectedVersionId = selectedVersionByArticle[selectedArticle.id] ?? selectedArticle.versions[0]?.id;
  const selectedVersion = selectedArticle.versions.find((version) => version.id === selectedVersionId) ?? selectedArticle.versions[0];
  const selectedArticleIsPublished = selectedArticle.visibility === "public" && selectedArticle.status === "Опубликована";
  const widgetArticles = useMemo(() => getWidgetArticles(articleDrafts, widgetQuery), [articleDrafts, widgetQuery]);

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

  function saveDraftVersion() {
    const nextVersion = createNextVersion(selectedArticle);

    updateSelectedArticle((article) => ({
      ...article,
      version: nextVersion.label,
      versions: [nextVersion, ...article.versions],
      approvalHistory: [
        createApprovalEvent(article, "Сохранил версию", "Черновик версии доступен в истории.", "info"),
        ...article.approvalHistory
      ]
    }));
    setSelectedVersionByArticle((current) => ({
      ...current,
      [selectedArticle.id]: nextVersion.id
    }));
    onToast(`${selectedArticle.title}: черновик сохранен.`);
  }

  function submitForReview() {
    updateSelectedArticle((article) => ({
      ...article,
      status: "На проверке",
      approvalHistory: [
        createApprovalEvent(article, "Отправил на проверку", "Статья ожидает решения старшего сотрудника.", "info"),
        ...article.approvalHistory
      ]
    }));
    onToast(`${selectedArticle.title}: отправлено на проверку.`);
  }

  function approveArticle() {
    updateSelectedArticle((article) => ({
      ...article,
      status: "Опубликована",
      approvalHistory: [
        createApprovalEvent(article, "Опубликовал", "Публичная версия обновлена для выбранных каналов.", "ok"),
        ...article.approvalHistory
      ]
    }));
    onToast(`${selectedArticle.title}: опубликована.`);
  }

  function rejectArticle() {
    updateSelectedArticle((article) => ({
      ...article,
      status: "Черновик",
      approvalHistory: [
        createApprovalEvent(article, "Вернул на доработку", "Нужны правки перед публикацией.", "warn"),
        ...article.approvalHistory
      ]
    }));
    onToast(`${selectedArticle.title}: возвращена на доработку.`);
  }

  function addAttachment() {
    const nextAttachment = {
      id: `${selectedArticle.id}-attachment-${selectedArticle.attachments.length + 1}`,
      name: `Регламент: ${selectedArticle.category}.docx`,
      type: "DOCX",
      size: "180 КБ",
      status: "ready"
    };

    updateSelectedArticle((article) => ({
      ...article,
      attachments: [...article.attachments, nextAttachment],
      approvalHistory: [
        createApprovalEvent(article, "Добавил вложение", nextAttachment.name, "info"),
        ...article.approvalHistory
      ]
    }));
    onToast(`${selectedArticle.title}: вложение добавлено.`);
  }

  function removeAttachment(attachmentId) {
    updateSelectedArticle((article) => ({
      ...article,
      attachments: article.attachments.filter((attachment) => attachment.id !== attachmentId)
    }));
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
              <select value={selectedArticle.status} onChange={(event) => updateArticleDraft("status", event.target.value)}>
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
            <button onClick={saveDraftVersion} type="button">
              <Pencil size={16} />
              Сохранить
            </button>
            <button className="primary-action" onClick={submitForReview} type="button">
              <CheckCircle2 size={16} />
              На проверку
            </button>
            <button onClick={approveArticle} type="button">
              <ShieldCheck size={16} />
              Опубликовать
            </button>
            <button onClick={rejectArticle} type="button">
              <RotateCcw size={16} />
              На доработку
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
            <button onClick={addAttachment} type="button"><UploadCloud size={15} /> Добавить</button>
          </header>
          <div className="knowledge-attachment-list">
            {selectedArticle.attachments.map((attachment) => (
              <article key={attachment.id}>
                <FileText size={17} />
                <div>
                  <strong>{attachment.name}</strong>
                  <span>{attachment.type} · {attachment.size}</span>
                </div>
                <button aria-label={`Удалить ${attachment.name}`} onClick={() => removeAttachment(attachment.id)} type="button">
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
