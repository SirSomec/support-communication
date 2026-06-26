import React, { useState } from "react";
import { BookOpen, CheckCircle2, Plus } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { initialTemplates } from "../../data.js";
import { ProductScreen, SectionTitle, ToolbarSearch } from "../../ui.jsx";

export function TemplatesScreen({ onBack, onToast, templates, onTemplatesChange }) {
  const [localItems, setLocalItems] = useState(initialTemplates);
  const items = templates ?? localItems;
  const setItems = onTemplatesChange ?? setLocalItems;
  const [selectedId, setSelectedId] = useState("delay");
  const [query, setQuery] = useState("");
  const selected = items.find((template) => template.id === selectedId) ?? items[0] ?? null;
  const visibleItems = items.filter((template) => `${template.title} ${template.text} ${template.topic}`.toLowerCase().includes(query.toLowerCase()));

  function updateSelected(field, value) {
    if (!selected) {
      return;
    }

    setItems((current) => current.map((template) => template.id === selected.id ? { ...template, [field]: value } : template));
  }

  function createTemplate() {
    const next = {
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
      <div className="templates-workspace">
        <section className="template-browser">
          <div className="screen-toolbar compact">
            <ToolbarSearch value={query} onChange={setQuery} placeholder="Найти шаблон" />
          </div>
          <div className="template-cards">
            {visibleItems.map((template) => (
              <button className={`template-card ${selected.id === template.id ? "selected" : ""}`} key={template.id} onClick={() => setSelectedId(template.id)}>
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
                <button className="primary-action" onClick={() => onToast("Шаблон сохранен.")}><CheckCircle2 size={17} /> Сохранить</button>
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
