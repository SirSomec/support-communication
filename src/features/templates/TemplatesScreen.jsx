import React, { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, Plus } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { templateService } from "../../services/templateService.js";
import { Modal, ProductScreen, ScreenStateStrip, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import { insertTemplateVariable, renderTemplatePreview, TEMPLATE_VARIABLES } from "./templateModel.js";
import "./templates.css";

// Область доступа шаблона: канонические ключи бэкенда + русские подписи.
const SCOPE_OPTIONS = [
  { value: "personal", label: "Личный" },
  { value: "team", label: "Командный" },
  { value: "global", label: "Глобальный" }
];

function normalizeScope(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["personal", "private", "личный"].includes(raw)) return "personal";
  if (["global", "глобальный"].includes(raw)) return "global";
  return "team";
}

function scopeLabel(value) {
  const normalized = normalizeScope(value);
  return SCOPE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
}

export function TemplatesScreen({ onBack, onToast, templates, onTemplatesChange, access }) {
  const [localItems, setLocalItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const items = templates ?? localItems;
  const setItems = onTemplatesChange ?? setLocalItems;
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const textAreaRef = useRef(null);
  // Командные и глобальные шаблоны создают и правят только старшие роли;
  // роль «Сотрудник» работает с личными шаблонами.
  const canManageShared = Boolean(access?.canManageSharedTemplates);
  const selected = items.find((template) => template.id === selectedId) ?? items[0] ?? null;
  const selectedScope = selected ? normalizeScope(selected.scope) : "team";
  const canEditSelected = Boolean(selected) && (canManageShared || selectedScope === "personal");
  const visibleItems = items.filter((template) => `${template.title} ${template.text} ${template.topic}`.toLowerCase().includes(query.toLowerCase()));
  const scopeOptions = canManageShared ? SCOPE_OPTIONS : SCOPE_OPTIONS.filter((option) => option.value === "personal");

  useEffect(() => {
    let ignore = false;

    async function loadTemplates() {
      setLoading(true);
      setError("");
      const response = await templateService.fetchTemplates();
      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить шаблоны.");
        setLoading(false);
        return;
      }

      const loaded = Array.isArray(response.data?.items) ? response.data.items : Array.isArray(response.data?.templates) ? response.data.templates : [];
      setItems(loaded);
      setSelectedId(loaded[0]?.id ?? "");
      setLoading(false);
    }

    if (!templates) {
      void loadTemplates();
    } else {
      setLoading(false);
      setSelectedId(templates[0]?.id ?? "");
    }

    return () => {
      ignore = true;
    };
  }, [setItems, templates]);

  function updateSelected(field, value) {
    if (!selected) {
      return;
    }

    setItems((current) => current.map((template) => template.id === selected.id ? { ...template, [field]: value } : template));
  }

  function addVariable(variable) {
    if (!selected) {
      return;
    }
    const field = textAreaRef.current;
    const inserted = insertTemplateVariable(selected.text, variable, field?.selectionStart, field?.selectionEnd);
    updateSelected("text", inserted.text);
    requestAnimationFrame(() => {
      textAreaRef.current?.focus();
      textAreaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  function extractSavedTemplate(response) {
    const data = response.data ?? {};
    if (data.template?.id) {
      return data.template;
    }
    return data.id ? data : null;
  }

  async function createTemplate() {
    const scope = canManageShared ? "team" : "personal";
    const response = await templateService.saveTemplate({
      title: "Новый шаблон",
      scope,
      channel: "Все",
      topic: "Без группы",
      text: "Введите текст шаблона."
    });

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось создать шаблон.");
      return;
    }

    const next = extractSavedTemplate(response) ?? {
      id: `template-${Date.now()}`,
      title: "Новый шаблон",
      scope,
      channel: "Все",
      topic: "Без группы",
      usage: 0,
      updated: "только что",
      text: "Введите текст шаблона."
    };

    setItems((current) => [next, ...current]);
    setSelectedId(next.id);
    onToast(scope === "personal" ? "Создан новый личный шаблон." : "Создан новый командный шаблон.");
  }

  async function saveSelectedTemplate() {
    if (!selected || !canEditSelected) {
      return;
    }

    const response = await templateService.saveTemplate({
      id: selected.id,
      title: selected.title,
      text: selected.text,
      topic: selected.topic,
      channel: selected.channel,
      scope: normalizeScope(selected.scope),
      version: selected.version
    });

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось сохранить шаблон.");
      return;
    }

    const saved = extractSavedTemplate(response) ?? selected;
    setItems((current) => current.map((template) => template.id === selected.id ? { ...template, ...saved, updated: "только что" } : template));
    onToast("Шаблон сохранен.");
  }

  if (loading) {
    return (
      <ProductScreen
        title="Шаблоны"
        subtitle="Загрузка библиотеки шаблонов..."
        onBack={onBack}
        stateItems={createScreenStateItems({
          loading: "загружается...",
          total: 0,
          emptyWhenZero: "ожидание API",
          errorLabel: "ошибок нет"
        })}
      />
    );
  }

  if (error) {
    return (
      <ProductScreen
        title="Шаблоны"
        subtitle="Не удалось загрузить шаблоны."
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
      />
    );
  }

  return (
    <ProductScreen
      title="Шаблоны"
      subtitle={canManageShared
        ? "Личные, командные и глобальные ответы с каналами, тематиками и переменными."
        : "Ваши личные шаблоны и командная библиотека. Командные шаблоны меняют старший сотрудник или администратор."}
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleItems.length,
        empty: `${visibleItems.length} шаблонов`,
        emptyWhenZero: "поиск без шаблонов",
        errorLabel: "ошибок редактора нет"
      })}
      actions={
        <button className="primary-action" onClick={createTemplate}>
          <Plus size={17} />
          {canManageShared ? "Новый шаблон" : "Новый личный шаблон"}
        </button>
      }
    >
      {!visibleItems.length ? (
        <ScreenStateStrip items={[{ label: "Templates", tone: "empty", value: "Шаблонов пока нет — создайте первый" }]} />
      ) : null}

      <div className="templates-workspace">
        <section className="template-browser">
          <div className="screen-toolbar compact">
            <ToolbarSearch value={query} onChange={setQuery} placeholder="Найти шаблон" />
          </div>
          <div className="template-cards">
            {visibleItems.map((template) => (
              <button className={`template-card ${selected?.id === template.id ? "selected" : ""}`} key={template.id} onClick={() => setSelectedId(template.id)}>
                <span>
                  <strong>{template.title}</strong>
                  <small>{scopeLabel(template.scope)} • {template.channel}</small>
                </span>
                <b>{template.usage}</b>
                <p>{template.text}</p>
                <em>{template.updated}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="template-editor">
          {selected ? (
            <>
              <SectionTitle title="Редактор шаблона" action={scopeLabel(selected.scope)} />
              {!canEditSelected ? (
                <p className="template-readonly-hint">
                  Командные и глобальные шаблоны может изменять только старший сотрудник или администратор.
                  Вы можете создавать и редактировать личные шаблоны.
                </p>
              ) : null}
              <div className="form-grid">
                <label>
                  <span>Название</span>
                  <input disabled={!canEditSelected} value={selected.title} onChange={(event) => updateSelected("title", event.target.value)} />
                </label>
                <label>
                  <span>Канал</span>
                  <select disabled={!canEditSelected} value={selected.channel} onChange={(event) => updateSelected("channel", event.target.value)}>
                    {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span>Тематика</span>
                  <input disabled={!canEditSelected} value={selected.topic} onChange={(event) => updateSelected("topic", event.target.value)} />
                </label>
                <label>
                  <span>Доступ</span>
                  <select
                    disabled={!canEditSelected || !canManageShared}
                    title={canManageShared ? "Кому виден шаблон" : "Роль «Сотрудник» создаёт только личные шаблоны"}
                    value={selectedScope}
                    onChange={(event) => updateSelected("scope", event.target.value)}
                  >
                    {(canManageShared ? SCOPE_OPTIONS : scopeOptions.concat(SCOPE_OPTIONS.filter((option) => option.value === selectedScope && option.value !== "personal"))).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="large-field">
                <span>Текст ответа</span>
                <textarea disabled={!canEditSelected} ref={textAreaRef} value={selected.text} onChange={(event) => updateSelected("text", event.target.value)} />
              </label>
              <div className="variable-row">
                {TEMPLATE_VARIABLES.map((variable) => <button disabled={!canEditSelected} key={variable} onClick={() => addVariable(variable)} type="button">{variable}</button>)}
              </div>
              <footer className="editor-actions">
                <button onClick={() => setPreviewOpen(true)} type="button"><BookOpen size={17} /> Предпросмотр</button>
                <button className="primary-action" disabled={!canEditSelected} onClick={saveSelectedTemplate} type="button"><CheckCircle2 size={17} /> Сохранить</button>
              </footer>
            </>
          ) : (
            <div className="entity-empty">
              <strong>Шаблон не выбран</strong>
              <span>Создайте новый шаблон или измените поисковый запрос.</span>
            </div>
          )}
        </section>
      </div>
      {previewOpen && selected ? (
        <Modal
          eyebrow="Шаблон ответа"
          footer={<button className="primary-action" onClick={() => setPreviewOpen(false)} type="button">Закрыть</button>}
          onClose={() => setPreviewOpen(false)}
          overlayClassName="confirm-overlay"
          panelClassName="confirm-panel"
          title="Предпросмотр шаблона"
          titleId="template-preview-title"
        >
          <div className="confirm-body template-preview-body">
            <div className="template-preview-meta">
              <span>{selected.channel}</span>
              <span>{selected.topic || "Без тематики"}</span>
            </div>
            <p className="template-preview-message">
              {renderTemplatePreview(selected.text, { topic: selected.topic || "Общий вопрос" }) || "Текст шаблона пока пуст."}
            </p>
          </div>
        </Modal>
      ) : null}
    </ProductScreen>
  );
}
