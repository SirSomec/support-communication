import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Info,
  MessageCircle,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Trash2,
  UploadCloud
} from "lucide-react";
import { getPreSendQualityChecks } from "../../app/aiQualityModel.js";
import { attachmentStatusLabels } from "../../app/dialogModel.js";
import { AiComposerPanel } from "./AiComposerPanel.jsx";
import { AttachmentPreview } from "./AttachmentPreview.jsx";
import "./dialog-composer.css";

export function Composer({
  mode,
  setMode,
  draft,
  setDraft,
  aiSuggestions: inlineAiSuggestions,
  onAiSuggestionAction,
  attachments,
  onAttachFiles,
  onAttachmentComplete,
  onAttachmentRetry,
  onAttachmentRemove,
  onReplyChannelChange,
  onSend,
  replyChannel = "",
  replyChannelOptions = [],
  templates,
  onSaveTemplate,
  disabled
}) {
  const primaryTemplate = templates[0];
  const fileInputRef = useRef(null);
  const [isTemplatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [isQualityOpen, setQualityOpen] = useState(true);
  const blockingAttachment = attachments.find((attachment) => attachment.status !== "ready");
  const sendDisabled = disabled || Boolean(blockingAttachment);
  const attachmentReason = blockingAttachment
    ? blockingAttachment.status === "uploading"
      ? "Дождитесь завершения загрузки вложений."
      : "Удалите вложение с ошибкой или повторите загрузку."
    : "";
  const aiDraft =
    mode === "internal"
      ? "Клиент эмоционален, перед закрытием проверьте статус доставки и добавьте ссылку на заказ во внутренний комментарий."
      : "Понимаю ожидание. Я проверю статус заказа и вернусь с точным временем доставки в этом диалоге.";
  const preSendChecks = getPreSendQualityChecks({ draft, mode, attachments, suggestions: inlineAiSuggestions });
  const preSendTone = preSendChecks.some((check) => check.tone === "danger")
    ? "danger"
    : preSendChecks.some((check) => check.tone === "warn")
      ? "warn"
      : "ok";

  function handleFileInputChange(event) {
    onAttachFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <section className={`composer ${mode === "internal" ? "internal-mode" : ""}`}>
      <div className="composer-tabs">
        <button className={mode === "reply" ? "active" : ""} onClick={() => setMode("reply")} disabled={disabled}>
          <MessageCircle size={17} />
          Ответ клиенту
        </button>
        <button className={mode === "internal" ? "active" : ""} onClick={() => setMode("internal")} disabled={disabled}>
          <Info size={17} />
          Внутренний комментарий
        </button>
        <button
          aria-expanded={isTemplatePickerOpen}
          onClick={() => setTemplatePickerOpen((current) => !current)}
          disabled={disabled || !primaryTemplate}
          type="button"
        >
          <BookOpen size={17} />
          Шаблоны
        </button>
      </div>
      {isTemplatePickerOpen ? (
        <div className="composer-template-picker">
          {templates.slice(0, 4).map((template) => (
            <button
              key={template.id}
              onClick={() => {
                setDraft(template.text);
                setTemplatePickerOpen(false);
              }}
              type="button"
            >
              <strong>{template.title}</strong>
              <span>{template.scope} · {template.channel} · {template.topic}</span>
            </button>
          ))}
        </div>
      ) : null}
      <AiComposerPanel suggestions={inlineAiSuggestions} disabled={disabled} onAction={onAiSuggestionAction} />
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={disabled ? "Диалог закрыт" : mode === "internal" ? "Текст увидят только сотрудники..." : "Введите сообщение..."}
        disabled={disabled}
      />
      <input
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        aria-label="Выбор вложений"
        className="visually-hidden-file-input"
        disabled={disabled}
        multiple
        onChange={handleFileInputChange}
        ref={fileInputRef}
        type="file"
      />
      {attachments.length ? (
        <div className="attachment-queue" aria-label="Очередь вложений">
          {attachments.map((attachment) => (
            <article className={`attachment-card ${attachment.status}`} key={attachment.id}>
              <AttachmentPreview attachment={attachment} />
              <span className={`attachment-status ${attachment.status}`}>
                {attachment.status === "uploading" ? <UploadCloud size={14} /> : null}
                {attachment.status === "error" ? <AlertTriangle size={14} /> : null}
                {attachmentStatusLabels[attachment.status]}
              </span>
              <div className="attachment-progress" aria-hidden="true">
                <i style={{ width: `${attachment.progress}%` }} />
              </div>
              {attachment.error ? <p>{attachment.error}</p> : null}
              <div className="attachment-actions">
                {attachment.status === "error" && attachment.retryable ? (
                  <button disabled={disabled} onClick={() => onAttachmentRetry(attachment.id)} type="button">
                    <RotateCcw size={14} />
                    Повторить
                  </button>
                ) : null}
                <button aria-label={`Удалить ${attachment.name}`} disabled={disabled} onClick={() => onAttachmentRemove(attachment.id)} title="Удалить вложение" type="button">
                  <Trash2 size={14} />
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {attachmentReason ? (
        <div className="composer-warning">
          <AlertTriangle size={15} />
          {attachmentReason}
        </div>
      ) : null}
      <section className={`pre-send-quality ${preSendTone}`} aria-label="Проверка качества перед отправкой">
        <button
          aria-expanded={isQualityOpen}
          onClick={() => setQualityOpen((current) => !current)}
          type="button"
        >
          <span>
            <ShieldCheck size={16} />
            Pre-send check
          </span>
          <b>{preSendTone === "ok" ? "готово" : preSendTone === "warn" ? "есть замечания" : "нужна проверка"}</b>
        </button>
        {isQualityOpen ? (
          <div className="pre-send-check-list">
            {preSendChecks.map((check) => (
              <span className={check.tone} key={check.id}>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </span>
            ))}
          </div>
        ) : null}
      </section>
      <footer className="composer-footer">
        <div className="composer-tools">
          {mode !== "internal" && replyChannelOptions.length ? (
            <label className="composer-channel-select" title="Канал, в который уйдет ответ клиенту">
              <span>Канал:</span>
              <select
                aria-label="Канал отправки ответа"
                disabled={disabled}
                onChange={(event) => onReplyChannelChange?.(event.target.value)}
                value={replyChannelOptions.some((option) => option.channel === replyChannel) ? replyChannel : replyChannelOptions[0]?.channel ?? ""}
              >
                {replyChannelOptions.map((option) => (
                  <option key={option.channel} value={option.channel}>
                    {option.channel}{option.isClosed ? " · обращение закрыто" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button aria-label="Прикрепить файл" disabled={disabled} onClick={() => fileInputRef.current?.click()} title="Прикрепить файл" type="button"><Paperclip size={18} /></button>
          <button aria-label="Добавить реакцию" disabled={disabled} onClick={() => setDraft(`${draft} Спасибо.`.trim())} type="button"><Smile size={18} /></button>
          <button aria-label="Сохранить как шаблон" disabled={disabled} onClick={onSaveTemplate} title="Сохранить как шаблон" type="button"><BookOpen size={18} /></button>
          <button
            aria-label="ИИ-подсказка"
            disabled={disabled}
            onClick={() => {
              if (inlineAiSuggestions.length) {
                onAiSuggestionAction(inlineAiSuggestions[0], "edit");
                return;
              }

              setDraft((current) => [current.trim(), aiDraft].filter(Boolean).join("\n\n"));
            }}
            title="ИИ-подсказка"
            type="button"
          >
            <Sparkles size={18} />
          </button>
        </div>
        <button className="send-button" onClick={onSend} disabled={sendDisabled} title={attachmentReason || undefined}>
          <Send size={18} />
          {mode === "internal" ? "Сохранить" : "Отправить"}
        </button>
      </footer>
    </section>
  );
}
