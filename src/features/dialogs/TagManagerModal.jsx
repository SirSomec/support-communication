import React, { useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { Modal } from "../../ui.jsx";
import {
  buildTagSuggestions,
  getVisibleTags,
  isServiceTag,
  normalizeTagInput,
  TAG_LIMIT_PER_DIALOG,
  TAG_MAX_LENGTH,
  validateTagInput
} from "./tagSuggestionModel.js";

// Модалка «Добавить тег»: черновик редактируется локально и применяется
// одним нажатием «Сохранить» — так случайный клик по предложению не уходит
// в API, а закрытие по Esc ничего не меняет.
export function TagManagerModal({ conversation, topic, allConversations = [], onApply, onClose }) {
  const initialTags = useMemo(() => getVisibleTags(conversation), [conversation]);
  const [draftTags, setDraftTags] = useState(initialTags);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const [saving, setSaving] = useState(false);

  // Предложения строятся без учета видимых тегов диалога: если оператор
  // удалит тег в черновике, подсказка снова станет доступна ниже.
  const suggestions = useMemo(() => buildTagSuggestions({
    conversation: { ...conversation, tags: (conversation.tags ?? []).filter((tag) => isServiceTag(tag)) },
    conversations: allConversations,
    limit: 8,
    topic
  }), [allConversations, conversation, topic]);

  const draftKeys = new Set(draftTags.map((tag) => normalizeTagInput(tag)));
  const visibleSuggestions = suggestions.filter((item) => !draftKeys.has(item.tag));
  const hasChanges = draftTags.length !== initialTags.length
    || draftTags.some((tag, index) => tag !== initialTags[index]);

  function addTag(value) {
    const result = validateTagInput(value, draftTags);
    if (!result.ok) {
      setInputError(result.error);
      return false;
    }
    setInputError("");
    setDraftTags((current) => [...current, result.tag]);
    return true;
  }

  function removeTag(tag) {
    setInputError("");
    setDraftTags((current) => current.filter((item) => item !== tag));
  }

  function handleInputSubmit(event) {
    event.preventDefault();
    if (addTag(input)) {
      setInput("");
    }
  }

  async function handleSave() {
    if (saving) {
      return;
    }
    setSaving(true);
    const result = await onApply(draftTags);
    setSaving(false);
    if (result?.ok) {
      onClose();
    }
  }

  return (
    <Modal
      eyebrow={`Диалог · ${conversation.name}`}
      footer={
        <>
          <span className="tag-manager-footer-hint">Тегов: {draftTags.length} из {TAG_LIMIT_PER_DIALOG}</span>
          <button disabled={saving} onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!hasChanges || saving} onClick={handleSave} type="button">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </>
      }
      onClose={onClose}
      overlayClassName="tag-manager-overlay"
      panelClassName="tag-manager-panel"
      title="Теги диалога"
      titleId="tag-manager-title"
    >
      <div className="tag-manager-body">
        <section aria-label="Текущие теги">
          <h3>Выбранные теги</h3>
          <div className="tag-manager-current">
            {draftTags.map((tag) => (
              <span className="tag-manager-chip" key={tag}>
                {tag}
                <button aria-label={`Убрать тег ${tag}`} onClick={() => removeTag(tag)} type="button">×</button>
              </span>
            ))}
            {!draftTags.length ? (
              <p className="tag-manager-empty">Тегов пока нет — выберите из предложенных или добавьте свой.</p>
            ) : null}
          </div>
        </section>

        <form className="tag-manager-input" onSubmit={handleInputSubmit}>
          <input
            aria-label="Новый тег"
            maxLength={TAG_MAX_LENGTH + 8}
            onChange={(event) => { setInput(event.target.value); setInputError(""); }}
            placeholder="Свой тег, например: возврат"
            type="text"
            value={input}
          />
          <button type="submit"><Plus size={15} /> Добавить</button>
        </form>
        {inputError ? <p className="tag-manager-error" role="alert">{inputError}</p> : null}

        <section aria-label="Предложенные теги">
          <h3><Sparkles size={14} /> Предложения по ситуации</h3>
          <div className="tag-manager-suggestions">
            {visibleSuggestions.map((item) => (
              <button key={item.tag} onClick={() => addTag(item.tag)} title="Добавить тег" type="button">
                <b>#{item.tag}</b>
                <small>{item.hint}</small>
              </button>
            ))}
            {!visibleSuggestions.length ? (
              <p className="tag-manager-empty">Подходящие предложения уже добавлены в диалог.</p>
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  );
}
