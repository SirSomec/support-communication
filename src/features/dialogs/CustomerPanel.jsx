import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Copy, FileText, Lock, Pencil, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { maskPhone, resolutionOutcomeLabels, isRepeatAppeal } from "../../app/dialogModel.js";
import { mapApiConversationCollection } from "../../app/conversationApiMapper.js";
import { dialogService } from "../../services/dialogService.js";
import { knowledgeService } from "../../services/knowledgeService.js";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import {
  buildClientDialogHistory,
  clientHistoryDefaultFilters,
  mergeClientConversations
} from "./clientDialogHistoryModel.js";
import { ClientArchiveDetailModal, ClientDialogsListModal } from "./ClientHistoryModals.jsx";
import { RepeatAppealBadge } from "./RepeatAppealBadge.jsx";
import { TagManagerModal } from "./TagManagerModal.jsx";
import { TopicCombobox } from "./TopicCombobox.jsx";
import { getVisibleTags } from "./tagSuggestionModel.js";

export function CustomerPanel({
  conversation,
  topic,
  topicOptions = [],
  onTopic,
  setDraft,
  templates,
  onClose,
  access,
  isClosed,
  allConversations = [],
  onEnsureConversationLoaded,
  onNavigateToAppeal,
  onClientPhoneSave,
  onTagsApply
}) {
  const [resolutionOutcome, setResolutionOutcome] = useState("resolved");
  const [previewArticle, setPreviewArticle] = useState(null);
  const channelTemplates = templates.filter((template) => sameValue(template.channel, conversation.channel));
  const recommendedTemplates = channelTemplates.length ? channelTemplates : templates;
  const [knowledgeArticles, setKnowledgeArticles] = useState([]);
  const recommendedArticles = useMemo(() => rankArticles(knowledgeArticles, conversation, topic), [conversation, knowledgeArticles, topic]);
  const [historyView, setHistoryView] = useState(null);
  const [historyFilters, setHistoryFilters] = useState(clientHistoryDefaultFilters);
  const [historyExtras, setHistoryExtras] = useState([]);
  const [historyFetchState, setHistoryFetchState] = useState({ error: "", loading: false });
  const [historyNavigating, setHistoryNavigating] = useState(false);
  const [historyNavigateError, setHistoryNavigateError] = useState("");
  const historyFetchedForRef = useRef("");
  const [isTagManagerOpen, setTagManagerOpen] = useState(false);
  const [removingTag, setRemovingTag] = useState("");
  const visibleTags = useMemo(() => getVisibleTags(conversation), [conversation]);
  const canManageTags = Boolean(onTagsApply) && Boolean(access.canManageDialogs);
  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [copyState, setCopyState] = useState("idle");
  const phoneValue = String(conversation.phone ?? "").trim();
  // Пустой телефон (источник его не передал) может заполнить любой оператор
  // с правом ведения диалогов; исправлять уже сохраненный номер — только
  // роль, которой контакты видны без маски.
  const canEditPhone = Boolean(onClientPhoneSave)
    && Boolean(access.canManageDialogs)
    && (!phoneValue || Boolean(access.canViewSensitive));

  function startPhoneEdit() {
    setPhoneDraft(phoneValue);
    setPhoneError("");
    setPhoneEditing(true);
  }

  function cancelPhoneEdit() {
    setPhoneEditing(false);
    setPhoneError("");
  }

  async function handlePhoneSubmit(event) {
    event.preventDefault();
    if (phoneSaving) {
      return;
    }
    setPhoneSaving(true);
    const result = await onClientPhoneSave(phoneDraft);
    setPhoneSaving(false);
    if (result?.ok) {
      setPhoneEditing(false);
      setPhoneError("");
      return;
    }
    if (result?.error) {
      setPhoneError(result.error);
    }
  }

  // Крестик на чипе убирает тег сразу, без модалки; на время запроса
  // чип блокируется, чтобы повторный клик не отправил второй PATCH.
  async function handleQuickRemoveTag(tag) {
    if (!canManageTags || removingTag) {
      return;
    }
    setRemovingTag(tag);
    await onTagsApply(visibleTags.filter((item) => item !== tag));
    setRemovingTag("");
  }

  useEffect(() => {
    let ignore = false;
    void knowledgeService.fetchArticles({ visibility: "public" }).then((response) => {
      if (!ignore && response.status === "ok") setKnowledgeArticles(Array.isArray(response.data?.items) ? response.data.items : []);
    });
    return () => { ignore = true; };
  }, [conversation.id, conversation.channel, topic]);

  useEffect(() => {
    setHistoryView(null);
    setHistoryFilters(clientHistoryDefaultFilters);
    setHistoryExtras([]);
    setHistoryFetchState({ error: "", loading: false });
    setHistoryNavigating(false);
    setHistoryNavigateError("");
    historyFetchedForRef.current = "";
    setTagManagerOpen(false);
    setRemovingTag("");
    setPhoneEditing(false);
    setPhoneDraft("");
    setPhoneError("");
    setPhoneSaving(false);
    setCopyState("idle");
  }, [conversation.id]);

  async function copyClientSummary() {
    const visiblePhone = phoneValue
      ? (access.canViewSensitive ? phoneValue : maskPhone(phoneValue))
      : "Не указан";
    const result = await copyTextToClipboard([
      `Клиент: ${conversation.name}`,
      `Телефон: ${visiblePhone}`,
      `Канал: ${conversation.channel || "Не указан"}`,
      `Тематика: ${topic || conversation.topic || "Не выбрана"}`
    ].join("\n"));
    setCopyState(result.ok ? "copied" : "error");
  }

  // Зависимость — булев флаг, а не объект historyView: переключение
  // список <-> переписка не должно прерывать запрос полного списка.
  const historyViewOpen = Boolean(historyView);

  useEffect(() => {
    if (!historyViewOpen) {
      return undefined;
    }

    const phone = String(conversation.phone ?? "").trim();
    if (!phone || historyFetchedForRef.current === conversation.id) {
      return undefined;
    }

    let ignore = false;
    setHistoryFetchState({ error: "", loading: true });
    void dialogService.fetchDialogs({ page: 1, pageSize: 100, query: phone }).then((response) => {
      if (ignore) {
        return;
      }

      if (response.status === "ok") {
        historyFetchedForRef.current = conversation.id;
        setHistoryExtras(mapApiConversationCollection(response.data));
        setHistoryFetchState({ error: "", loading: false });
      } else {
        setHistoryFetchState({
          error: response.error?.message ?? "Не удалось обновить полный список — показаны уже загруженные диалоги.",
          loading: false
        });
      }
    });

    return () => {
      ignore = true;
      setHistoryFetchState((current) => (current.loading ? { error: "", loading: false } : current));
    };
  }, [conversation.id, conversation.phone, historyViewOpen]);

  const historyEntries = useMemo(
    () => buildClientDialogHistory({ conversation, conversations: mergeClientConversations(allConversations, historyExtras) }),
    [allConversations, conversation, historyExtras]
  );
  const previousHistoryEntries = useMemo(
    () => historyEntries.filter((entry) => !entry.isCurrent),
    [historyEntries]
  );
  const archiveEntry = historyView?.type === "archive" ? historyView.entry : null;

  function openArchiveDetail(entry, from) {
    setHistoryNavigateError("");
    setHistoryView({ entry, from, type: "archive" });
  }

  // Обработчики закрытия мемоизированы: Modal перевешивает фокус-ловушку по ссылке
  // onClose, и новая ссылка на каждый рендер сбрасывала бы фокус из поля поиска.
  const closeHistoryView = useCallback(() => {
    setHistoryNavigateError("");
    setHistoryView(null);
  }, []);

  const closeArchiveDetail = useCallback(() => {
    setHistoryNavigateError("");
    setHistoryView((current) => (current?.from === "list" ? { type: "list" } : null));
  }, []);

  // Клик по обращению из истории перемещает окно чата к этому обращению:
  // все обращения клиента показываются в единой ленте диалога.
  async function handleHistoryNavigate(entry) {
    if (!onNavigateToAppeal || !entry.conversationId || historyNavigating) {
      return;
    }

    const isLoaded = allConversations.some((item) => item.id === entry.conversationId);
    if (!isLoaded && onEnsureConversationLoaded) {
      setHistoryNavigating(true);
      setHistoryNavigateError("");
      const result = await onEnsureConversationLoaded(entry.conversationId);
      setHistoryNavigating(false);
      if (!result?.ok) {
        setHistoryNavigateError("Не удалось открыть обращение — обновите список и попробуйте еще раз.");
        return;
      }
    }

    setHistoryView(null);
    onNavigateToAppeal(entry.conversationId);
  }

  return (
    <aside className="customer-panel" aria-label="Карточка клиента">
      <PanelSection title="О клиенте" action={(
        <button
          aria-label={copyState === "copied" ? "Данные клиента скопированы" : "Копировать данные клиента"}
          onClick={() => void copyClientSummary()}
          title={copyState === "copied" ? "Скопировано" : copyState === "error" ? "Не удалось скопировать" : "Копировать данные клиента"}
          type="button"
        >
          <Copy size={18} />
        </button>
      )}>
        {isRepeatAppeal(conversation) ? (
          <div className="repeat-appeal-panel-note">
            <RepeatAppealBadge conversation={conversation} />
            <p>Клиент снова обратился по той же тематике в течение 24 часов после предыдущего закрытия.</p>
          </div>
        ) : null}
        {phoneEditing ? (
          <form className="info-row info-row-phone-edit" onSubmit={handlePhoneSubmit}>
            <span id={`client-phone-label-${conversation.id}`}>Телефон</span>
            <div className="phone-edit-controls">
              <input
                aria-labelledby={`client-phone-label-${conversation.id}`}
                autoFocus
                disabled={phoneSaving}
                inputMode="tel"
                onChange={(event) => setPhoneDraft(event.target.value)}
                placeholder="+7 999 123-45-67"
                type="tel"
                value={phoneDraft}
              />
              <button className="phone-edit-save" disabled={phoneSaving} type="submit">Сохранить</button>
              <button disabled={phoneSaving} onClick={cancelPhoneEdit} type="button">Отмена</button>
            </div>
            {phoneError ? <p className="phone-edit-error" role="alert">{phoneError}</p> : null}
          </form>
        ) : (
          <div className="info-row">
            <span>Телефон</span>
            <strong className={phoneValue ? "" : "info-row-empty"}>
              {phoneValue ? (access.canViewSensitive ? phoneValue : maskPhone(phoneValue)) : "Не указан"}
            </strong>
            {canEditPhone ? (
              <button
                aria-label={phoneValue ? "Изменить телефон клиента" : "Указать телефон клиента"}
                className="phone-edit-toggle"
                onClick={startPhoneEdit}
                title={phoneValue ? "Изменить телефон клиента" : "Источник не передал телефон — укажите его вручную"}
                type="button"
              >
                <Pencil size={14} />
              </button>
            ) : null}
          </div>
        )}
        <InfoRow label="Устройство" value={conversation.device} icon={<Smartphone size={15} />} />
        <InfoRow label="Точка входа" value={conversation.entry} />
        <InfoRow label="Клиент с" value={conversation.clientSince} />
        <InfoRow label="Язык" value={conversation.language} />
        <div className="channel-list">
          <span>Канал(ы)</span>
          <div>
            {(conversation.channels ?? [conversation.channel]).filter(Boolean).map((channel) => (
              <span className={`channel-chip ${String(channel).toLowerCase()}`} key={channel}>{channel}</span>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection
        title="Предыдущие диалоги"
        action={
          <button onClick={() => { setHistoryNavigateError(""); setHistoryView({ type: "list" }); }} type="button">
            Смотреть все
          </button>
        }
      >
        <div className="history-list">
          {historyNavigateError && !historyView ? (
            <p className="client-history-note error inline" role="alert">{historyNavigateError}</p>
          ) : null}
          {previousHistoryEntries.length ? previousHistoryEntries.slice(0, 3).map((entry) => (
            <button
              className="history-row history-row-button"
              disabled={entry.kind === "conversation" && historyNavigating}
              key={entry.key}
              onClick={() => (entry.kind === "conversation" ? handleHistoryNavigate(entry) : openArchiveDetail(entry, "panel"))}
              title={entry.kind === "conversation" ? "Переместить окно чата к обращению" : "Открыть детали архивной записи"}
              type="button"
            >
              <time>{entry.dateLabel}</time>
              <span>{entry.title}</span>
              <b className={entry.isClosed ? "" : "open"}>{entry.statusLabel}</b>
            </button>
          )) : (
            <div className="history-row">
              <time>-</time>
              <span>Истории пока нет</span>
              <b>Новый</b>
            </div>
          )}
        </div>
      </PanelSection>

      <PanelSection
        title="Теги"
        action={
          <button
            disabled={!canManageTags}
            onClick={() => setTagManagerOpen(true)}
            title={canManageTags ? "Открыть подбор тегов" : access.reason}
            type="button"
          >
            <Plus size={16} /> Добавить тег
          </button>
        }
      >
        <div className="tag-list">
          {visibleTags.map((tag) => (
            <span className={removingTag === tag ? "tag-removing" : ""} key={tag}>
              {tag}
              {canManageTags ? (
                <button
                  aria-label={`Удалить тег ${tag}`}
                  disabled={Boolean(removingTag)}
                  onClick={() => handleQuickRemoveTag(tag)}
                  title={`Удалить тег ${tag}`}
                  type="button"
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          {!visibleTags.length ? <p className="tag-list-empty">Тегов пока нет.</p> : null}
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
        <div className="close-topic">
          <span>Тематика</span>
          <TopicCombobox disabled={isClosed} onChange={onTopic} options={topicOptions} value={topic} />
        </div>
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
      {historyView?.type === "list" ? (
        <ClientDialogsListModal
          canViewSensitive={access.canViewSensitive}
          clientName={conversation.name}
          clientPhone={conversation.phone}
          entries={historyEntries}
          fetchState={historyFetchState}
          filters={historyFilters}
          navigating={historyNavigating}
          navigateError={historyNavigateError}
          onClose={closeHistoryView}
          onFiltersChange={(patch) => setHistoryFilters((current) => ({ ...current, ...patch }))}
          onNavigate={handleHistoryNavigate}
          onOpenArchiveEntry={(entry) => openArchiveDetail(entry, "list")}
        />
      ) : null}
      {archiveEntry ? (
        <ClientArchiveDetailModal
          clientName={conversation.name}
          entry={archiveEntry}
          onClose={closeArchiveDetail}
        />
      ) : null}
      {isTagManagerOpen ? (
        <TagManagerModal
          allConversations={allConversations}
          conversation={conversation}
          onApply={onTagsApply}
          onClose={() => setTagManagerOpen(false)}
          topic={topic}
        />
      ) : null}
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
