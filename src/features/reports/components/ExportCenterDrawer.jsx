import React, { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Download, FileClock, FileJson, FileSpreadsheet, FileText, History, Printer, RefreshCcw, ShieldCheck, X } from "lucide-react";
import { useModalA11y } from "../../../app/useModalA11y.js";
import { reportService } from "../../../services/reportService.js";
import { reportWorkspaceQuery } from "../model/reportViewState.js";

const METRIC_FORMATS = [
  { icon: FileSpreadsheet, label: "Excel (XLSX)", value: "XLSX" },
  { icon: FileText, label: "CSV", value: "CSV" },
  { icon: FileJson, label: "JSON", value: "JSON" },
  { icon: Printer, label: "Печать / PDF", value: "PDF" }
];
const TRANSCRIPT_FORMATS = ["XLSX", "HTML", "JSON", "TXT"];
const FALLBACK_COLUMNS = [
  { id: "metric", label: "Показатель", locked: true },
  { id: "today", label: "Текущий период" },
  { id: "previous", label: "Предыдущий период" },
  { id: "delta", label: "Изменение" },
  { id: "status", label: "Статус" }
];
const STATUS_LABELS = { error: "Ошибка", expired: "Истёк", queued: "В очереди", ready: "Готов", running: "Формируется" };

export function ExportCenterDrawer({ access, disabled = false, disabledReason = "", jobs, onClose, onJobCreated, onRefresh, onToast, view, workspace }) {
  const panelRef = useModalA11y(onClose);
  const [mode, setMode] = useState("metrics");
  const [format, setFormat] = useState("XLSX");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const columns = workspace?.columnOptions?.length ? workspace.columnOptions : FALLBACK_COLUMNS;
  const [selectedColumns, setSelectedColumns] = useState(() => columns.map((column) => column.id));
  const sortedJobs = useMemo(() => [...(jobs ?? [])].sort((a, b) => Date.parse(b.createdAt ?? 0) - Date.parse(a.createdAt ?? 0)), [jobs]);

  useEffect(() => {
    setSelectedColumns((current) => {
      const valid = current.filter((id) => columns.some((column) => column.id === id));
      return valid.length ? valid : columns.map((column) => column.id);
    });
  }, [columns]);

  function selectMode(nextMode) {
    setMode(nextMode);
    setFormat("XLSX");
    setError("");
  }

  async function createExport() {
    if (disabled) {
      setError(disabledReason || "Экспорт временно недоступен до успешного обновления отчета.");
      return;
    }
    if (mode === "metrics" && format === "PDF") {
      onClose();
      window.setTimeout(() => window.print(), 80);
      return;
    }
    if (!access?.canExportReports || busy) return;
    if (mode === "metrics" && !selectedColumns.length) {
      setError("Выберите хотя бы одну колонку выгрузки.");
      return;
    }
    setBusy(true);
    setError("");
    const query = reportWorkspaceQuery(view);
    const activeChannel = view.filters.channel !== "all" ? view.filters.channel : "Все каналы";
    const response = await reportService.requestReportExport({
      channel: activeChannel,
      ...(mode === "metrics" ? { columns: selectedColumns } : {}),
      filters: {
        ...query,
        snapshotAt: workspace?.snapshotAt || undefined
      },
      format,
      idempotencyKey: `reports-${mode}-${format}-${makeRequestId()}`,
      period: view.period,
      reportType: mode === "metrics" ? "support_operations" : "dialog_transcripts"
    });
    setBusy(false);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось поставить выгрузку в очередь.";
      setError(message);
      onToast?.(message);
      return;
    }
    const job = response.data?.job;
    if (job) onJobCreated?.(job);
    onRefresh?.();
    onToast?.(job?.statusKey === "ready" ? "Выгрузка готова к скачиванию." : "Выгрузка поставлена в очередь.");
  }

  async function download(job) {
    const response = await reportService.downloadExportFile(job);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось скачать файл.";
      setError(message);
      onToast?.(message);
      return;
    }
    const url = URL.createObjectURL(response.data.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.data.fileName || job.fileName || `${job.id}.${String(job.format ?? "xlsx").toLowerCase()}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    onToast?.(`Скачивается ${link.download}.`);
  }

  async function retry(job) {
    const response = await reportService.retryReportExport(job);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось повторить выгрузку.";
      setError(message);
      onToast?.(message);
      return;
    }
    onJobCreated?.(response.data?.job ?? job);
    onRefresh?.();
    onToast?.("Выгрузка поставлена на повторную подготовку.");
  }

  return (
    <div className="reports-drawer-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-label="Экспорт отчетов" aria-modal="true" className="reports-drawer reports-export-drawer" ref={panelRef} role="dialog">
        <header>
          <div><Download aria-hidden="true" size={20} /><span><strong>Центр экспорта</strong><small>Снимок данных, история и неизменяемый аудит</small></span></div>
          <button aria-label="Закрыть экспорт" onClick={onClose} type="button"><X size={19} /></button>
        </header>
        <div className="reports-drawer-body">
          <div aria-label="Тип выгрузки" className="reports-export-tabs" role="tablist">
            <button aria-selected={mode === "metrics"} onClick={() => selectMode("metrics")} role="tab" type="button">Показатели</button>
            <button aria-selected={mode === "transcripts"} onClick={() => selectMode("transcripts")} role="tab" type="button">Диалоги</button>
          </div>

          {mode === "metrics" ? (
            <section aria-labelledby="reports-export-settings-title" className="reports-export-settings">
              <div><h2 id="reports-export-settings-title">Формат снимка</h2><p>Период, часовой пояс и активные фильтры совпадут с экраном.</p></div>
              <div className="reports-format-grid">
                {METRIC_FORMATS.map((item) => {
                  const Icon = item.icon;
                  return <button aria-pressed={format === item.value} key={item.value} onClick={() => setFormat(item.value)} type="button"><Icon aria-hidden="true" size={18} /><span>{item.label}</span>{format === item.value ? <Check aria-hidden="true" size={15} /> : null}</button>;
                })}
              </div>
              {format !== "PDF" ? (
                <fieldset className="reports-export-columns">
                  <legend>Колонки</legend>
                  {columns.map((column) => <label key={column.id}><input checked={selectedColumns.includes(column.id)} disabled={column.locked} onChange={() => setSelectedColumns((current) => current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id])} type="checkbox" />{column.label}</label>)}
                </fieldset>
              ) : <p className="reports-export-note"><Printer aria-hidden="true" size={16} />Откроется системная печать браузера. Выберите «Сохранить как PDF».</p>}
            </section>
          ) : (
            <section className="reports-export-settings" data-testid="dialog-export-panel">
              <div><h2>Выгрузка переписки</h2><p>Полные диалоги в текущем периоде и с текущими фильтрами.</p></div>
              <label className="reports-transcript-format">Формат
                <select aria-label="Формат выгрузки диалогов" data-testid="dialog-export-format" onChange={(event) => setFormat(event.target.value)} value={format}>
                  {TRANSCRIPT_FORMATS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </section>
          )}

          {disabled && !error ? <p className="reports-export-error" role="status">{disabledReason || "Экспорт временно недоступен до успешного обновления отчета."}</p> : null}
          {error ? <p className="reports-export-error" role="alert">{error}</p> : null}
          {!access?.canExportReports && !(mode === "metrics" && format === "PDF") ? <p className="reports-export-error">У вашей роли нет права reports.export.</p> : null}
          <button className="reports-export-run" data-testid={mode === "transcripts" ? "dialog-export-run" : undefined} disabled={disabled || busy || (!access?.canExportReports && format !== "PDF")} onClick={createExport} type="button">
            {busy ? <Clock3 className="spin" aria-hidden="true" size={17} /> : format === "PDF" ? <Printer aria-hidden="true" size={17} /> : <Download aria-hidden="true" size={17} />}
            {busy ? "Создаём…" : format === "PDF" ? "Печать / PDF" : "Создать выгрузку"}
          </button>

          <section className="reports-export-history" data-testid="report-export-history-panel">
            <header><span><History aria-hidden="true" size={17} /><strong>История выгрузок</strong></span><button aria-label="Обновить историю выгрузок" onClick={onRefresh} type="button"><RefreshCcw aria-hidden="true" size={15} /></button></header>
            <div data-testid="report-export-history">
              {sortedJobs.map((job) => <ExportJob job={job} key={job.id} onDownload={download} onRetry={retry} />)}
              {!sortedJobs.length ? <p className="reports-inline-empty">Выгрузок ещё нет.</p> : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function ExportJob({ job, onDownload, onRetry }) {
  const statusKey = job.statusKey ?? "queued";
  return (
    <article aria-label={job.name || "Отчёт"} className={`reports-export-job is-${statusKey}`}>
      <div className="reports-export-job-main">
        <span className="reports-file-icon"><FileClock aria-hidden="true" size={17} /></span>
        <span><strong>{job.name || "Отчёт"}</strong><small>{job.format} · {job.period} · {formatTimestamp(job.createdAt)}</small></span>
        <em>{STATUS_LABELS[statusKey] ?? job.status ?? statusKey}</em>
      </div>
      {statusKey === "queued" || statusKey === "running" ? <div aria-label={`Готовность ${job.progress ?? 0}%`} aria-valuemax="100" aria-valuemin="0" aria-valuenow={job.progress ?? 0} className="reports-progress" role="progressbar"><i style={{ width: `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%` }} /></div> : null}
      <div className="reports-export-job-actions">
        {statusKey === "ready" ? <button onClick={() => onDownload(job)} type="button"><Download aria-hidden="true" size={14} />Скачать</button> : null}
        {statusKey === "error" || statusKey === "expired" ? <button onClick={() => onRetry(job)} type="button"><RefreshCcw aria-hidden="true" size={14} />Повторить</button> : null}
        <details data-testid="report-audit-panel"><summary><ShieldCheck aria-hidden="true" size={14} />Аудит</summary><dl><div><dt>Job ID</dt><dd>{job.id}</dd></div><div><dt>Audit ID</dt><dd>{job.auditId ?? "—"}</dd></div><div><dt>Снимок</dt><dd>{job.filters?.snapshotAt ?? "—"}</dd></div><div><dt>Строк</dt><dd>{Number.isFinite(Number(job.rows)) ? job.rows : "—"}</dd></div></dl></details>
      </div>
      {job.failureMessage ? <p className="reports-export-job-error">{job.failureMessage}</p> : null}
    </article>
  );
}

function makeRequestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(timestamp) : "—";
}
