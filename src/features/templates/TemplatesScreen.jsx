import React, { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Plus } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { templateService } from "../../services/templateService.js";
import { ProductScreen, ScreenStateStrip, SectionTitle, ToolbarSearch } from "../../ui.jsx";
import "./templates.css";

export function TemplatesScreen({ onBack, onToast, templates, onTemplatesChange }) {
  const [localItems, setLocalItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const items = templates ?? localItems;
  const setItems = onTemplatesChange ?? setLocalItems;
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const selected = items.find((template) => template.id === selectedId) ?? items[0] ?? null;
  const visibleItems = items.filter((template) => `${template.title} ${template.text} ${template.topic}`.toLowerCase().includes(query.toLowerCase()));

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

  async function createTemplate() {
    const response = await templateService.saveTemplate({
      title: "Новый шаблон",
      scope: "Личный",
      channel: "Все",
      topic: "Без группы",
      text: "Введите текст шаблона."
    });

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось создать шаблон.");
      return;
    }

    const next = response.data?.template ?? {
      id: `template-${Date.now()}`,
      title: "Новый шаблон",
      scope: "Личный",
      channel: "Все",
      topic: "Без группы",
      usage: 0,
      updated: "только что",
      text: "Введите текст шаблона."
    };

    setItems((current) => [next, ...current]);
    setSelectedId(next.id);
    onToast("Создан новый личный шаблон.");
  }

  async function saveSelectedTemplate() {
    if (!selected) {
      return;
    }

    const response = await templateService.saveTemplate({
      id: selected.id,
      title: selected.title,
      text: selected.text,
      topic: selected.topic,
      channel: selected.channel,
      version: selected.version
    });

    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось сохранить шаблон.");
      return;
    }

    const saved = response.data?.template ?? selected;
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
      subtitle="Личные, командные и глобальные ответы с каналами, тематиками и переменными."
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
          Новый шаблон
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
                  <small>{template.scope} • {template.channel}</small>
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
              <SectionTitle title="Редактор шаблона" action={selected.scope} />
              <div className="form-grid">
                <label>
                  <span>Название</span>
                  <input value={selected.title} onChange={(event) => updateSelected("title", event.target.value)} />
                </label>
                <label>
                  <span>Канал</span>
                  <select value={selected.channel} onChange={(event) => updateSelected("channel", event.target.value)}>
                    {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span>Тематика</span>
                  <input value={selected.topic} onChange={(event) => updateSelected("topic", event.target.value)} />
                </label>
                <label>
                  <span>Доступ</span>
                  <select value={selected.scope} onChange={(event) => updateSelected("scope", event.target.value)}>
                    {["Личный", "Командный", "Глобальный"].map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              </div>
              <label className="large-field">
                <span>Текст ответа</span>
                <textarea value={selected.text} onChange={(event) => updateSelected("text", event.target.value)} />
              </label>
              <div className="variable-row">
                {["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"].map((variable) => <button key={variable}>{variable}</button>)}
              </div>
              <footer className="editor-actions">
                <button onClick={() => onToast("Предпросмотр шаблона открыт.")}><BookOpen size={17} /> Предпросмотр</button>
                <button className="primary-action" onClick={saveSelectedTemplate}><CheckCircle2 size={17} /> Сохранить</button>
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
    </ProductScreen>
  );
}
