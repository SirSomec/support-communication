import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, FileText, Lock, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { maskPhone, resolutionOutcomeLabels, isRepeatAppeal } from "../../app/dialogModel.js";
import { knowledgeService } from "../../services/knowledgeService.js";
import { RepeatAppealBadge } from "./RepeatAppealBadge.jsx";

export function CustomerPanel({ conversation, topic, topicOptions = [], onTopic, setDraft, templates, onClose, access, isClosed }) {
  const [resolutionOutcome, setResolutionOutcome] = useState("resolved");
  const [previewArticle, setPreviewArticle] = useState(null);
  const channelTemplates = templates.filter((template) => sameValue(template.channel, conversation.channel));
  const recommendedTemplates = channelTemplates.length ? channelTemplates : templates;
  const [knowledgeArticles, setKnowledgeArticles] = useState([]);
  const recommendedArticles = useMemo(() => rankArticles(knowledgeArticles, conversation, topic), [conversation, knowledgeArticles, topic]);

  useEffect(() => {
    let ignore = false;
    void knowledgeService.fetchArticles({ visibility: "public" }).then((response) => {
      if (!ignore && response.status === "ok") setKnowledgeArticles(Array.isArray(response.data?.items) ? response.data.items : []);
    });
    return () => { ignore = true; };
  }, [conversation.id, conversation.channel, topic]);

  return (
    <aside className="customer-panel" aria-label="Карточка клиента">
      <PanelSection title="О клиенте" action={<button aria-label="Копировать"><Copy size={18} /></button>}>
        {isRepeatAppeal(conversation) ? (
          <div className="repeat-appeal-panel-note">
            <RepeatAppealBadge conversation={conversation} />
            <p>Клиент снова обратился по той же тематике в течение 24 часов после предыдущего закрытия.</p>
          </div>
        ) : null}
        <InfoRow label="Телефон" value={access.canViewSensitive ? conversation.phone : maskPhone(conversation.phone)} />
        <InfoRow label="Устройство" value={conversation.device} icon={<Smartphone size={15} />} />
        <InfoRow label="Точка входа" value={conversation.entry} />
        <InfoRow label="Клиент с" value={conversation.clientSince} />
        <InfoRow label="Язык" value={conversation.language} />
        <div className="channel-list">
          <span>Канал(ы)</span>
          <div>
            {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
              <span className={`channel-chip ${channel.toLowerCase()}`} key={channel}>{channel}</span>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Предыдущие диалоги" action={<button>Смотреть все</button>}>
        <div className="history-list">
          {(conversation.previous.length ? conversation.previous : [["-", "Истории пока нет", "Новый"]]).map(([date, title, status]) => (
            <div className="history-row" key={`${date}${title}`}>
              <time>{date}</time>
              <span>{title}</span>
              <b>{status}</b>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Теги" action={<button><Plus size={16} /> Добавить тег</button>}>
        <div className="tag-list">
          {conversation.tags.map((tag) => (
            <span key={tag}>{tag}<button aria-label={`Удалить тег ${tag}`}>×</button></span>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые шаблоны">
        <div className="template-list">
          {recommendedTemplates.slice(0, 3).map((template) => (
            <button key={template.id} onClick={() => setDraft(template.text)}>
              <span>
                <strong>{template.title}</strong>
                <small>{template.scope} · {template.channel}</small>
              </span>
              <b>Вставить</b>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые статьи">
        <div className="article-list">
          {recommendedArticles.map((article) => (
            <button key={article.id} onClick={() => setPreviewArticle(article)} title="Открыть статью">
              <span>
                <strong>{article.title}</strong>
                <small>{article.category}</small>
              </span>
              <FileText size={17} />
            </button>
          ))}
          {!recommendedArticles.length ? <p>Опубликованных статей для этого канала пока нет.</p> : null}
        </div>
      </PanelSection>

      <PanelSection title="Закрытие диалога">
        <label className="close-topic">
          <span>Тематика</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)} disabled={isClosed}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        {!isClosed ? (
          <label className="close-topic">
            <span>Результат</span>
            <select value={resolutionOutcome} onChange={(event) => setResolutionOutcome(event.target.value)}>
              {Object.entries(resolutionOutcomeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ) : null}
        <button className="close-button" onClick={() => onClose({ resolutionOutcome })} disabled={isClosed || !topic}>
          {isClosed ? <ShieldCheck size={17} /> : <Lock size={17} />}
          {isClosed ? "Закрыт" : "Закрыть"}
        </button>
        {!topic ? (
          <p className="close-warning">
            <AlertTriangle size={16} />
            Для закрытия укажите тематику
          </p>
        ) : null}
      </PanelSection>
      {previewArticle ? (
        <div className="article-preview-overlay" role="presentation" onMouseDown={() => setPreviewArticle(null)}>
          <section aria-modal="true" className="article-preview-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label={`Статья: ${previewArticle.title}`}>
            <header>
              <div>
                <span>{previewArticle.category}</span>
                <h2>{previewArticle.title}</h2>
              </div>
              <button aria-label="Закрыть статью" onClick={() => setPreviewArticle(null)} type="button">×</button>
            </header>
            <p>{previewArticle.body}</p>
            <footer>
              <button onClick={() => setPreviewArticle(null)} type="button">Закрыть</button>
              <button className="primary-action" onClick={() => { setDraft(previewArticle.body); setPreviewArticle(null); }} type="button">Вставить в ответ</button>
            </footer>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function sameValue(left, right) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function rankArticles(articles, conversation, topic) {
  const channel = String(conversation?.channel ?? "").trim().toLowerCase();
  const query = `${topic ?? ""} ${conversation?.topic ?? ""}`.toLowerCase();
  return articles
    .filter((article) => article.channels?.some((item) => sameValue(item, channel)))
    .map((article) => ({ ...article, score: Number(`${article.title} ${article.category} ${(article.topics ?? []).join(" ")}`.toLowerCase().includes(query)) + Number(article.helpfulRate ?? 0) / 100 }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function PanelSection({ title, action, children }) {
  return (
    <section className="panel-section">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon}
    </div>
  );
}
