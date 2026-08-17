import React, { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useModalA11y } from "../../../app/useModalA11y.js";
import { resolutionOutcomeLabels, statusLabels } from "../../../app/dialogModel.js";
import { REPORT_FILTER_DEFAULTS } from "../model/reportViewState.js";

const filterFields = [
  { key: "channel", label: "Канал", optionsKey: "channels" },
  { key: "teamId", label: "Команда", optionsKey: "teamId" },
  { key: "queueId", label: "Очередь", optionsKey: "queueId" },
  { key: "operatorId", label: "Оператор", optionsKey: "operators" },
  { key: "topic", label: "Тематика", optionsKey: "topic" },
  { key: "status", label: "Статус", optionsKey: "status" },
  { key: "resolutionOutcome", label: "Результат решения", optionsKey: "resolutionOutcome" }
];

export function ReportFilterDrawer({ onApply, onClose, options, view }) {
  const [draft, setDraft] = useState(() => ({ ...view.filters }));
  const panelRef = useModalA11y(onClose);
  useEffect(() => setDraft({ ...view.filters }), [view.filters]);

  return (
    <div className="reports-drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-label="Фильтры отчета" aria-modal="true" className="reports-drawer reports-filter-drawer" ref={panelRef} role="dialog">
        <header>
          <div><SlidersHorizontal aria-hidden="true" size={20} /><span><strong>Фильтры отчета</strong><small>Одинаково применяются ко всем метрикам и экспорту</small></span></div>
          <button aria-label="Закрыть фильтры" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <div className="reports-drawer-body reports-filter-grid">
          {filterFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <select value={draft[field.key] ?? "all"} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))}>
                <option value="all">Все</option>
                {optionRows(options?.[field.optionsKey], field.key).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <footer>
          <button className="reports-reset-button" onClick={() => setDraft({ ...REPORT_FILTER_DEFAULTS })} type="button"><RotateCcw size={16} />Сбросить</button>
          <button className="primary-action" onClick={() => { onApply(draft); onClose(); }} type="button">Применить</button>
        </footer>
      </aside>
    </div>
  );
}

function optionRows(values, key) {
  if (!Array.isArray(values)) return [];
  return values.map((item) => {
    const value = typeof item === "object" ? String(item.value ?? item.id ?? "") : String(item);
    const rawLabel = typeof item === "object" ? String(item.label ?? item.name ?? value) : value;
    const label = key === "status" ? statusLabels[value] ?? rawLabel : key === "resolutionOutcome" ? resolutionOutcomeLabels[value] ?? rawLabel : rawLabel;
    return { label, value };
  }).filter((item) => item.value);
}
