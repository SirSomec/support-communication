import React from "react";
import { CalendarDays, ChevronDown, Download, Filter, RefreshCw } from "lucide-react";
import { activeReportFilters, comparisonLabel, REPORT_PERIOD_OPTIONS, reportPeriodLabel } from "../model/reportViewState.js";

export function ReportCommandBar({ exporting, onExport, onFilters, onRefresh, refreshing, view, onViewChange }) {
  const active = activeReportFilters(view);
  return (
    <section className="reports-command-bar" aria-label="Параметры отчета">
      <label className="reports-command-control reports-period-control">
        <CalendarDays aria-hidden="true" size={17} />
        <span className="sr-only">Период отчета</span>
        <select
          aria-label="Период отчета"
          value={view.period}
          onChange={(event) => onViewChange({ ...view, period: event.target.value })}
        >
          {REPORT_PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <ChevronDown aria-hidden="true" size={15} />
      </label>
      {view.period === "custom" ? (
        <div className="reports-date-range" aria-label="Произвольный период">
          <label>С <input type="date" value={view.customRange.from} onChange={(event) => onViewChange({ ...view, customRange: { ...view.customRange, from: event.target.value } })} /></label>
          <label>По <input type="date" value={view.customRange.to} onChange={(event) => onViewChange({ ...view, customRange: { ...view.customRange, to: event.target.value } })} /></label>
        </div>
      ) : null}
      <label className="reports-command-control reports-compare-control">
        <span>Сравнение:</span>
        <select
          aria-label="Сравнение периодов"
          value={view.compare ? "previous" : "none"}
          onChange={(event) => onViewChange({ ...view, compare: event.target.value === "previous" })}
        >
          <option value="previous">Предыдущий период</option>
          <option value="none">Без сравнения</option>
        </select>
        <ChevronDown aria-hidden="true" size={15} />
      </label>
      <button className="reports-command-button" onClick={onFilters} type="button">
        <Filter aria-hidden="true" size={17} />
        Фильтры
        {active.length ? <span className="reports-filter-count" aria-label={`Активных фильтров: ${active.length}`}>{active.length}</span> : null}
      </button>
      <button className="reports-icon-button" disabled={refreshing} onClick={onRefresh} title="Обновить данные" type="button">
        <RefreshCw aria-hidden="true" className={refreshing ? "spin" : ""} size={17} />
        <span className="sr-only">Обновить данные</span>
      </button>
      <button className="reports-export-button" disabled={exporting} onClick={onExport} type="button">
        <Download aria-hidden="true" size={17} />
        Экспорт
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      <div className="reports-active-summary" aria-live="polite">
        <strong>{reportPeriodLabel(view)}</strong>
        <span>{comparisonLabel(view)}</span>
        {active.length ? <span>{active.length} активн. фильтр{active.length === 1 ? "" : active.length < 5 ? "а" : "ов"}</span> : <span>Все данные</span>}
      </div>
    </section>
  );
}
