import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Download, Gauge, PlayCircle } from "lucide-react";
import { statusLabels } from "../../app/dialogModel.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { reportService } from "../../services/reportService.js";
import { ChannelBadge, EntityTable, MetricTile, ProductScreen, ScreenStateStrip, SectionTitle, StatusBadge } from "../../ui.jsx";
import "./reports.css";

const exportStatusClasses = {
  ready: "ok",
  running: "info",
  queued: "hold",
  error: "warn",
  expired: "closed"
};

const routingActivityColumns = [
  { id: "operatorId", label: "Оператор" },
  { id: "assignments", label: "Назначено" },
  { id: "transfersFrom", label: "Передано" },
  { id: "transfersTo", label: "Получено" },
  { id: "transferEvents", label: "Передач" },
  { id: "totalEvents", label: "Всего событий" }
];

const dialogExportFormatOptions = [
  { label: "Excel (XLSX)", value: "XLSX" },
  { label: "HTML", value: "HTML" },
  { label: "JSON", value: "JSON" },
  { label: "TXT", value: "TXT" }
];

const dialogExportScoreOptions = [
  { label: "5", value: "5" },
  { label: "4", value: "4" },
  { label: "3", value: "3" },
  { label: "2", value: "2" },
  { label: "1", value: "1" },
  { label: "Без оценки", value: "none" }
];

const dialogExportPeriodOptions = [
  { label: "Сегодня", value: "Сегодня" },
  { label: "Вчера", value: "Вчера" },
  { label: "7 дней", value: "7 дней" },
  { label: "30 дней", value: "30 дней" },
  { label: "Произвольный период", value: "range" }
];

function localDateInputValue(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function ReportsScreen({ onBack, onToast, access }) {
  const [period, setPeriod] = useState("Сегодня");
  const [channel, setChannel] = useState("Все каналы");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState([]);
  const [hasActivity, setHasActivity] = useState(false);
  const [reportBars, setReportBars] = useState([]);
  const [reportChartBlocks, setReportChartBlocks] = useState([]);
  const [reportColumnOptions, setReportColumnOptions] = useState([]);
  const [reportRows, setReportRows] = useState([]);
  const [rescueOutcomeSummary, setRescueOutcomeSummary] = useState([]);
  const [rescueReportRows, setRescueReportRows] = useState([]);
  const [reportExportJobs, setReportExportJobs] = useState([]);
  const [dataQuality, setDataQuality] = useState(null);
  const [reportSnapshotAt, setReportSnapshotAt] = useState("");
  const [reportFilterOptions, setReportFilterOptions] = useState({});
  const [reportFilters, setReportFilters] = useState({
    operatorId: "all",
    outcome: "all",
    queueId: "all",
    resolutionOutcome: "all",
    status: "all",
    teamId: "all",
    topic: "all"
  });
  const [selectedColumns, setSelectedColumns] = useState([]);
  const [dialogExportFilters, setDialogExportFilters] = useState({
    operatorIds: [],
    scores: [],
    statuses: [],
    topics: []
  });
  const [dialogExportFormat, setDialogExportFormat] = useState("XLSX");
  const [dialogExportPeriod, setDialogExportPeriod] = useState("30 дней");
  const [dialogExportRange, setDialogExportRange] = useState({ from: localDateInputValue(6), to: localDateInputValue(0) });
  const [dialogExportBusy, setDialogExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportHistoryOpen, setExportHistoryOpen] = useState(false);
  const [selectedAuditJobId, setSelectedAuditJobId] = useState("");
  const [routingActivityLoading, setRoutingActivityLoading] = useState(true);
  const [routingActivityError, setRoutingActivityError] = useState("");
  const [routingActivityRows, setRoutingActivityRows] = useState([]);
  const [routingActivityTotals, setRoutingActivityTotals] = useState({ assignments: 0, operators: 0, totalEvents: 0, transfers: 0, unattributedEvents: 0 });
  const [routingEventType, setRoutingEventType] = useState("all");
  const [routingOperatorId, setRoutingOperatorId] = useState("all");
  const [routingOperatorOptions, setRoutingOperatorOptions] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadWorkspace() {
      setLoading(true);
      setError("");
      const response = await reportService.fetchReportWorkspace({
        channel,
        ...reportFilters,
        period,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset()
      });

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить рабочую область отчетов.");
        setLoading(false);
        return;
      }

      const data = response.data ?? {};
      const columns = Array.isArray(data.columnOptions) ? data.columnOptions : [];
      setMetrics(Array.isArray(data.metrics) ? data.metrics : []);
      setHasActivity(Boolean(data.hasActivity));
      setReportBars(Array.isArray(data.bars) ? data.bars : []);
      setReportChartBlocks(Array.isArray(data.chartBlocks) ? data.chartBlocks : []);
      setReportColumnOptions(columns);
      setReportRows(Array.isArray(data.rows) ? data.rows : []);
      setRescueOutcomeSummary(Array.isArray(data.rescueOutcomeSummary) ? data.rescueOutcomeSummary : []);
      setRescueReportRows(Array.isArray(data.rescueReportRows) ? data.rescueReportRows : []);
      setReportExportJobs(Array.isArray(data.exportJobs) ? data.exportJobs : []);
      setDataQuality(data.dataQuality ?? null);
      setReportSnapshotAt(data.snapshotAt ?? "");
      setReportFilterOptions(data.filterOptions ?? {});
      setSelectedColumns(columns.map((column) => column.id));
      setLoading(false);
    }

    void loadWorkspace();
    return () => {
      ignore = true;
    };
  }, [channel, period, reportFilters.operatorId, reportFilters.outcome, reportFilters.queueId, reportFilters.resolutionOutcome, reportFilters.status, reportFilters.teamId, reportFilters.topic]);

  const hasPendingExports = reportExportJobs.some((job) => job.statusKey === "queued" || job.statusKey === "running");

  useEffect(() => {
    if (!hasPendingExports) {
      return undefined;
    }

    let ignore = false;
    const refreshExportJobs = async () => {
      const response = await reportService.fetchReportWorkspace({
        channel,
        period,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset()
      });
      if (!ignore && response.status === "ok") {
        setReportExportJobs(Array.isArray(response.data?.exportJobs) ? response.data.exportJobs : []);
      }
    };
    const timer = window.setInterval(() => void refreshExportJobs(), 3000);
    void refreshExportJobs();

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [channel, hasPendingExports, period]);

  useEffect(() => {
    let ignore = false;

    async function loadRoutingActivity() {
      setRoutingActivityLoading(true);
      setRoutingActivityError("");
      const response = await reportService.fetchRoutingActivityReport({
        channel: channel === "Все каналы" ? undefined : channel,
        eventType: routingEventType === "all" ? undefined : routingEventType,
        operatorId: routingOperatorId === "all" ? undefined : routingOperatorId,
        period
      });

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setRoutingActivityError(response.error?.message ?? "Не удалось загрузить назначения и передачи.");
        setRoutingActivityLoading(false);
        return;
      }

      const data = response.data ?? {};
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setRoutingActivityRows(rows);
      setRoutingActivityTotals({
        assignments: Number(data.totals?.assignments ?? 0),
        operators: Number(data.totals?.operators ?? 0),
        totalEvents: Number(data.totals?.totalEvents ?? 0),
        transfers: Number(data.totals?.transfers ?? 0),
        unattributedEvents: Number(data.totals?.unattributedEvents ?? 0)
      });
      setRoutingOperatorOptions((current) => [...new Set([
        ...current,
        ...rows.map((row) => String(row.operatorId ?? "").trim()).filter(Boolean)
      ])].sort((left, right) => left.localeCompare(right, "ru")));
      setRoutingActivityLoading(false);
    }

    void loadRoutingActivity();
    return () => {
      ignore = true;
    };
  }, [channel, period, routingEventType, routingOperatorId]);

  const visibleReportColumns = reportColumnOptions.filter((column) => selectedColumns.includes(column.id));
  const selectedAuditJob = reportExportJobs.find((job) => job.id === selectedAuditJobId) ?? null;

  function toggleReportColumn(columnId) {
    const column = reportColumnOptions.find((item) => item.id === columnId);
    if (column?.locked) {
      return;
    }

    setSelectedColumns((current) => current.includes(columnId)
      ? current.filter((id) => id !== columnId)
      : [...current, columnId]
    );
  }

  async function handleCreateExport() {
    if (!access.canExportReports) {
      return;
    }

    const exportColumns = selectedColumns.length ? selectedColumns : reportColumnOptions.map((column) => column.id);
    const response = await reportService.requestReportExport({
      channel,
      columns: exportColumns,
      filters: {
        ...reportFilters,
        snapshotAt: reportSnapshotAt,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset()
      },
      period,
      reportType: "Диалоги"
    });
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось поставить экспорт в очередь.";
      setExportError(message);
      onToast(message);
      return;
    }

    const nextJob = {
      ...response.data.job,
      status: "В очереди",
      requestedBy: "Текущий оператор",
      createdAt: "сейчас"
    };

    setExportError("");
    setReportExportJobs((current) => [nextJob, ...current]);
    onToast(`Выгрузка XLSX за период "${period}" поставлена в очередь: ${nextJob.backendQueueId ?? nextJob.id}.`);
  }

  async function handleCreateDialogExport() {
    if (!access.canExportReports || dialogExportBusy) {
      return;
    }

    const customRange = dialogExportPeriod === "range";
    if (customRange && (!dialogExportRange.from || !dialogExportRange.to || dialogExportRange.from > dialogExportRange.to)) {
      const message = "Укажите корректный период выгрузки: дата начала не позже даты окончания.";
      setExportError(message);
      onToast(message);
      return;
    }

    setDialogExportBusy(true);
    const response = await reportService.requestReportExport({
      channel,
      filters: {
        ...dialogExportFilters,
        ...(customRange ? { dateFrom: dialogExportRange.from, dateTo: dialogExportRange.to } : {}),
        snapshotAt: reportSnapshotAt,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset()
      },
      format: dialogExportFormat,
      period: customRange ? `${dialogExportRange.from} — ${dialogExportRange.to}` : dialogExportPeriod,
      reportType: "dialog_transcripts"
    });
    setDialogExportBusy(false);

    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось сформировать выгрузку диалогов.";
      setExportError(message);
      onToast(message);
      return;
    }

    const job = response.data.job;
    setExportError("");
    setReportExportJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);

    if (job.statusKey === "ready") {
      await handleExportDownload(job);
      return;
    }

    if (job.statusKey === "error") {
      const message = job.failureMessage ?? "Экспорт диалогов завершился ошибкой, повторите из списка выгрузок.";
      setExportError(message);
      onToast(message);
      return;
    }

    onToast(`Выгрузка диалогов (${dialogExportFormat}) поставлена в очередь: ${job.backendQueueId ?? job.id}.`);
  }

  function handleOpenExportHistory() {
    setExportHistoryOpen(true);
    setSelectedAuditJobId((current) => current || reportExportJobs[0]?.id || "");
  }

  function handleOpenReportAudit(job) {
    setExportHistoryOpen(true);
    setSelectedAuditJobId(job.id);
  }

  async function handleExportRetry(jobId) {
    if (!access.canExportReports) {
      return;
    }

    const jobToRetry = reportExportJobs.find((job) => job.id === jobId);
    const response = await reportService.retryReportExport(jobToRetry);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось повторить экспорт.";
      setExportError(message);
      onToast(message);
      return;
    }

    setReportExportJobs((current) => current.map((job) => job.id === jobId
      ? { ...job, ...response.data.job, status: "Повторная подготовка", statusKey: response.data.job?.statusKey ?? "queued" }
      : job
    ));
    setExportError("");
    onToast("Экспорт поставлен на повторную подготовку.");
  }

  async function handleExportDownload(job) {
    if (!access.canExportReports) {
      return;
    }

    const response = await reportService.downloadExportFile(job);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось скачать файл выгрузки.";
      setExportError(message);
      onToast(message);
      return;
    }

    const url = URL.createObjectURL(response.data.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = response.data.fileName || `${job.id}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setExportError("");
    onToast(`${job.name}: файл ${job.format} скачивается (${response.data.fileName}).`);
  }

  function getReportCell(row, columnId) {
    if (columnId === "metric") return <strong>{row.metric}</strong>;
    if (columnId === "today") return <span>{row.today}</span>;
    if (columnId === "previous") return <span>{row.previous}</span>;
    if (columnId === "delta") return <b>{row.delta}</b>;
    return <span>{row.status}</span>;
  }

  function chartPointHeight(points, point) {
    const values = (Array.isArray(points) ? points : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const maximum = Math.max(1, ...values);
    const value = Number(point);

    if (!Number.isFinite(value) || value <= 0) {
      return 18;
    }

    return Math.max(18, Math.min(100, Math.round(value / maximum * 100)));
  }

  if (loading) {
    return (
      <ProductScreen
        title="Отчеты"
        subtitle="Загрузка рабочей области отчетов..."
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
        title="Отчеты"
        subtitle="Не удалось загрузить отчеты."
        onBack={onBack}
        stateItems={[
          { label: "Загрузка", tone: "error", value: "ошибка" },
          { label: "Данные", tone: "empty", value: "недоступны" },
          { label: "Ошибки", tone: "error", value: error }
        ]}
      />
    );
  }

  const headlineMetrics = hasActivity && metrics.length ? metrics : [
    { label: "Новых", value: "—", detail: "нет данных" },
    { label: "Закрыто", value: "—", detail: "нет данных" },
    { label: "Первый ответ", value: "—", detail: "нет данных" },
    { label: "SLA", value: "—", detail: "нет данных" }
  ];

  return (
    <ProductScreen
      title="Отчеты"
      subtitle="Фактические показатели по диалогам текущей организации."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: reportRows.length,
        empty: `${reportRows.length} метрик`,
        emptyWhenZero: "метрик нет",
        errors: reportExportJobs.filter((job) => job.statusKey === "error").length,
        errorLabel: "ошибок экспорта нет"
      })}
      actions={
        <>
          <select className="inline-select" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Период отчета">
            {["Сегодня", "Вчера", "7 дней", "30 дней"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canExportReports} onClick={handleCreateExport} title={access.canExportReports ? "Экспорт XLSX" : access.reason}>
            <Download size={17} />
            Экспорт XLSX
          </button>
        </>
      }
    >
      {!hasActivity ? (
        <ScreenStateStrip items={[{ label: "Отчёты", tone: "empty", value: "За выбранный период диалогов нет" }]} />
      ) : null}
      {dataQuality ? (
        <ScreenStateStrip items={[
          { label: "Источник", tone: "ok", value: "Журнал реальных событий диалогов" },
          { label: "События", tone: "ok", value: `${Number(dataQuality.eventCount ?? 0)} событий в ${Number(dataQuality.conversationCount ?? 0)} диалогах` },
          { label: "Обновление", tone: dataQuality.latestEventAt ? "ok" : "empty", value: dataQuality.latestEventAt ? formatReportTimestamp(dataQuality.latestEventAt) : "Событий нет" },
          { label: "Задержка", tone: Number(dataQuality.freshnessLagSeconds ?? 0) > 60 ? "partial" : "ok", value: dataQuality.freshnessLagSeconds === null ? "Нет данных" : `${Number(dataQuality.freshnessLagSeconds ?? 0)} сек.` },
          { label: "Покрытие", tone: Number(dataQuality.dimensionCoverage?.teamId?.unknown ?? 0) > 0 ? "partial" : "ok", value: `Команды ${Number(dataQuality.dimensionCoverage?.teamId?.known ?? 0)}/${Number(dataQuality.conversationCount ?? 0)}, результаты ${Number(dataQuality.dimensionCoverage?.resolutionOutcome?.known ?? 0)}/${Number(dataQuality.conversationCount ?? 0)}` },
          ...(Array.isArray(dataQuality.historicalLimitations) && dataQuality.historicalLimitations.length
            ? [{ label: "История", tone: "partial", value: dataQuality.backfillBoundary ? `Неполное восстановление до ${formatReportTimestamp(dataQuality.backfillBoundary)}` : "События до включения журнала восстановлены не полностью" }]
            : [])
        ]} />
      ) : null}

      <div className="metric-strip">
        {headlineMetrics.slice(0, 4).map((metric, index) => {
          const icons = [ClipboardList, CheckCircle2, Clock3, Gauge];
          const Icon = icons[index] ?? ClipboardList;
          return (
            <MetricTile
              icon={<Icon size={21} />}
              key={metric.label ?? index}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          );
        })}
      </div>

      <div className="screen-toolbar report-toolbar">
        <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Канал отчета">
          <option>Все каналы</option>
          {(reportFilterOptions.channels ?? []).map((option) => <option key={option}>{option}</option>)}
        </select>
        <ReportFacetSelect label="Оператор" options={reportFilterOptions.operatorId} value={reportFilters.operatorId} onChange={(value) => setReportFilters((current) => ({ ...current, operatorId: value }))} />
        <ReportFacetSelect label="Тема" options={reportFilterOptions.topic} value={reportFilters.topic} onChange={(value) => setReportFilters((current) => ({ ...current, topic: value }))} />
        <ReportFacetSelect label="Статус в периоде" options={reportFilterOptions.status} value={reportFilters.status} onChange={(value) => setReportFilters((current) => ({ ...current, status: value }))} />
        <ReportFacetSelect label="Результат закрытия" options={reportFilterOptions.resolutionOutcome} value={reportFilters.resolutionOutcome} onChange={(value) => setReportFilters((current) => ({ ...current, resolutionOutcome: value }))} />
        <ReportFacetSelect label="Результат rescue" options={reportFilterOptions.outcome} value={reportFilters.outcome} onChange={(value) => setReportFilters((current) => ({ ...current, outcome: value }))} />
        <ReportFacetSelect label="Очередь" options={reportFilterOptions.queueId} value={reportFilters.queueId} onChange={(value) => setReportFilters((current) => ({ ...current, queueId: value }))} />
        <ReportFacetSelect label="Команда" options={reportFilterOptions.teamId} value={reportFilters.teamId} onChange={(value) => setReportFilters((current) => ({ ...current, teamId: value }))} />
        <button onClick={handleOpenExportHistory} type="button"><CalendarDays size={17} /> История</button>
      </div>

      <section className="work-panel routing-activity-panel" data-testid="routing-activity-report">
        <SectionTitle title="Назначения и передачи" action="по фактическим событиям" />
        <div className="routing-activity-controls">
          <label>
            <span>Событие</span>
            <select className="inline-select" value={routingEventType} onChange={(event) => setRoutingEventType(event.target.value)}>
              <option value="all">Все события</option>
              <option value="assignment">Назначения</option>
              <option value="transfer">Передачи</option>
            </select>
          </label>
          <label>
            <span>Оператор</span>
            <select className="inline-select" value={routingOperatorId} onChange={(event) => setRoutingOperatorId(event.target.value)}>
              <option value="all">Все операторы</option>
              {routingOperatorOptions.map((operatorId) => <option key={operatorId} value={operatorId}>{operatorId}</option>)}
            </select>
          </label>
        </div>

        {routingActivityLoading ? <p className="routing-activity-state">Загрузка событий...</p> : null}
        {routingActivityError ? <p className="routing-activity-state error">{routingActivityError}</p> : null}
        {!routingActivityLoading && !routingActivityError ? (
          <>
            <div className="routing-activity-summary" aria-label="Итоги назначений и передач">
              <span><b>{routingActivityTotals.assignments}</b> назначений</span>
              <span><b>{routingActivityTotals.transfers}</b> передач</span>
              <span><b>{routingActivityTotals.operators}</b> операторов</span>
              <span><b>{routingActivityTotals.totalEvents}</b> событий</span>
            </div>
            {routingActivityRows.length ? (
              <EntityTable
                as="table"
                caption="Активность назначений и передач по операторам"
                className="routing-activity-table"
                columns={routingActivityColumns}
              >
                {routingActivityRows.map((row) => (
                  <tr className="entity-row" key={row.operatorId}>
                    <th scope="row">{row.operatorId}</th>
                    <td>{row.assignments}</td>
                    <td>{row.transfersFrom}</td>
                    <td>{row.transfersTo}</td>
                    <td>{row.transferEvents}</td>
                    <td><b>{row.totalEvents}</b></td>
                  </tr>
                ))}
              </EntityTable>
            ) : (
              <p className="routing-activity-state">За выбранный период назначений и передач нет.</p>
            )}
            {routingActivityTotals.unattributedEvents > 0 ? (
              <p className="routing-activity-note">Без указанного оператора: {routingActivityTotals.unattributedEvents}</p>
            ) : null}
          </>
        ) : null}
      </section>

      {exportError ? <div className="report-export-error">{exportError}</div> : null}

      {exportHistoryOpen ? (
        <section className="work-panel report-export-history-panel" data-testid="report-export-history-panel">
          <SectionTitle title="История экспортов" action={`${reportExportJobs.length} выгрузок`} />
          <div className="report-history-grid">
            {reportExportJobs.map((job) => (
              <button
                className={job.id === selectedAuditJobId ? "selected" : ""}
                data-testid="report-export-history-row"
                key={job.id}
                onClick={() => setSelectedAuditJobId(job.id)}
                type="button"
              >
                <span>
                  <strong>{job.name}</strong>
                  <small>{job.period} · {job.format} · {job.rows} строк</small>
                </span>
                <b>{job.auditId}</b>
                <StatusBadge tone={exportStatusClasses[job.statusKey] ?? "info"}>{job.status}</StatusBadge>
              </button>
            ))}
          </div>
          <footer>
            <span>История фактических выгрузок за выбранные периоды.</span>
            <button onClick={() => setExportHistoryOpen(false)} type="button">Свернуть</button>
          </footer>
        </section>
      ) : null}

      {selectedAuditJob ? (
        <section className="work-panel report-audit-panel" data-testid="report-audit-panel">
          <SectionTitle title="Проверка выгрузки" action="запись не изменяется" />
          <dl>
            <div><dt>Audit ID</dt><dd>{selectedAuditJob.auditId}</dd></div>
            <div><dt>Job</dt><dd>{selectedAuditJob.name}</dd></div>
            <div><dt>Status</dt><dd>{selectedAuditJob.status}</dd></div>
            <div><dt>Format</dt><dd>{selectedAuditJob.format}</dd></div>
            <div><dt>Period</dt><dd>{selectedAuditJob.period}</dd></div>
            <div><dt>Rows</dt><dd>{selectedAuditJob.rows}</dd></div>
            <div><dt>Queue ID</dt><dd>{selectedAuditJob.backendQueueId ?? selectedAuditJob.id}</dd></div>
            <div><dt>Queue</dt><dd>{selectedAuditJob.queue ?? "report-export"}</dd></div>
            <div><dt>Metric version</dt><dd>{selectedAuditJob.metricDefinitionVersion ?? "metrics/v1"}</dd></div>
            <div><dt>Requested by</dt><dd>{selectedAuditJob.requestedBy ?? "-"}</dd></div>
            <div><dt>Created</dt><dd>{selectedAuditJob.createdAt ?? "-"}</dd></div>
            {Array.isArray(selectedAuditJob.columns) && selectedAuditJob.columns.length ? (
              <div><dt>Columns</dt><dd>{selectedAuditJob.columns.join(", ")}</dd></div>
            ) : null}
            {selectedAuditJob.filters ? (
              <div><dt>Filters</dt><dd>{Object.entries(selectedAuditJob.filters).map(([key, value]) => `${key}: ${value}`).join(", ")}</dd></div>
            ) : null}
            {selectedAuditJob.failureCode ? (
              <div><dt>Failure</dt><dd>{selectedAuditJob.failureCode}: {selectedAuditJob.failureMessage ?? "without message"}</dd></div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {reportBars.length ? <div className="reports-layout">
        <section className="work-panel">
          <SectionTitle title="Каналы" action="Доля новых обращений" />
          <div className="bar-list">
            {reportBars.map(([label, value]) => (
              <div className="bar-row" key={label}>
                <ChannelBadge channel={label} />
                <div><i style={{ width: `${value}%` }} /></div>
                <b>{value}%</b>
              </div>
            ))}
          </div>
        </section>
        <section className="work-panel">
          <SectionTitle title="Краткий итог" action="по текущим данным" />
          <div className="digest-list">
            <p><b>Диалоги:</b> показатели рассчитаны по сообщениям выбранной организации.</p>
            <p><b>Состав:</b> {reportRows.length} показателя, {reportChartBlocks.length} графика.</p>
          </div>
        </section>
      </div> : null}

      {reportChartBlocks.length ? <section className="work-panel report-charts-panel">
        <SectionTitle title="Динамика" action="по выбранному периоду" />
        <div className="report-chart-grid">
          {reportChartBlocks.map((chart) => (
            <article className={`report-chart-card ${chart.tone}`} key={chart.id}>
              <header>
                <strong>{chart.title}</strong>
                <span>{chart.delta}</span>
              </header>
              <b>{chart.value}</b>
              <div className="mini-chart" aria-label={chart.title} role="img">
                {(chart.points ?? []).map((point, index) => (
                  <i style={{ height: `${chartPointHeight(chart.points, point)}%` }} key={`${chart.id}-${index}`} />
                ))}
              </div>
              <footer>
                {(chart.legend ?? []).map((item) => <span key={item}>{item}</span>)}
              </footer>
            </article>
          ))}
        </div>
      </section> : null}

      {rescueOutcomeSummary.length || rescueReportRows.length ? <section className="work-panel rescue-report-panel">
        <SectionTitle title="Спасенные и пропущенные" action="rescue timer outcomes" />
        <div className="rescue-outcome-summary">
          {rescueOutcomeSummary.map((item) => (
            <article className={`rescue-outcome-card ${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
        <div className="rescue-report-list">
          <div className="rescue-report-head">
            <span>Клиент</span>
            <span>Канал</span>
            <span>Timer</span>
            <span>Outcome</span>
            <span>Решение</span>
          </div>
          {rescueReportRows.map((row) => (
            <article className={`rescue-report-row ${row.outcome === "Пропущен" ? "missed" : "saved"}`} key={row.id}>
              <div>
                <strong>{row.client}</strong>
                <small>{row.operator} · {row.reason}</small>
              </div>
              <ChannelBadge channel={row.channel} />
              <b>{row.timer}</b>
              <StatusBadge tone={row.outcome === "Пропущен" ? "warn" : "ok"}>{row.outcome}</StatusBadge>
              <p>{row.resolution}<small>{row.digest}</small></p>
            </article>
          ))}
        </div>
      </section> : null}

      <section className="work-panel report-columns-panel">
        <SectionTitle title="Состав колонок выгрузки" action={`${selectedColumns.length} из ${reportColumnOptions.length}`} />
        <div className="report-column-controls">
          {reportColumnOptions.map((column) => (
            <label key={column.id}>
              <input
                checked={selectedColumns.includes(column.id)}
                disabled={column.locked}
                onChange={() => toggleReportColumn(column.id)}
                type="checkbox"
              />
              <span>{column.label}</span>
              {column.locked ? <b>обязательная</b> : null}
            </label>
          ))}
        </div>
      </section>

      <EntityTable
        as="table"
        caption="Показатели отчета"
        className="report-table"
        columns={visibleReportColumns}
        headClassName="report-dynamic-row"
        headStyle={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}
      >
        {reportRows.map((row) => (
          <tr className="entity-row report-dynamic-row" key={row.metric} style={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}>
            {visibleReportColumns.map((column) => (
              column.id === "metric"
                ? <th key={column.id} scope="row" style={{ textAlign: "left" }}>{getReportCell(row, column.id)}</th>
                : <td key={column.id}>{getReportCell(row, column.id)}</td>
            ))}
          </tr>
        ))}
      </EntityTable>

      <section className="work-panel dialog-export-panel" data-testid="dialog-export-panel">
        <SectionTitle title="Выгрузка диалогов с перепиской" action="сообщения и комментарии с авторами" />
        <p className="dialog-export-hint">
          В файл попадают диалоги, созданные за выбранный период и канал, вместе с сообщениями,
          внутренними комментариями, их авторами и CSAT-оценкой. Пустой фильтр означает «все значения».
        </p>
        <div className="dialog-export-controls">
          <label>
            <span>Период</span>
            <select
              aria-label="Период выгрузки диалогов"
              className="inline-select"
              data-testid="dialog-export-period"
              onChange={(event) => setDialogExportPeriod(event.target.value)}
              value={dialogExportPeriod}
            >
              {dialogExportPeriodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {dialogExportPeriod === "range" ? (
            <>
              <label>
                <span>С даты</span>
                <input
                  aria-label="Начало периода выгрузки"
                  className="inline-select"
                  max={dialogExportRange.to || undefined}
                  onChange={(event) => setDialogExportRange((current) => ({ ...current, from: event.target.value }))}
                  type="date"
                  value={dialogExportRange.from}
                />
              </label>
              <label>
                <span>По дату</span>
                <input
                  aria-label="Конец периода выгрузки"
                  className="inline-select"
                  min={dialogExportRange.from || undefined}
                  onChange={(event) => setDialogExportRange((current) => ({ ...current, to: event.target.value }))}
                  type="date"
                  value={dialogExportRange.to}
                />
              </label>
            </>
          ) : null}
          <MultiSelectDropdown
            allLabel="Все операторы"
            label="Операторы"
            onChange={(values) => setDialogExportFilters((current) => ({ ...current, operatorIds: values }))}
            options={(reportFilterOptions.operators ?? []).map((operator) => ({ label: operator.name, value: operator.id }))}
            selected={dialogExportFilters.operatorIds}
          />
          <MultiSelectDropdown
            allLabel="Все тематики"
            label="Тематики"
            onChange={(values) => setDialogExportFilters((current) => ({ ...current, topics: values }))}
            options={(reportFilterOptions.topic ?? []).map((topic) => ({ label: topic, value: topic }))}
            selected={dialogExportFilters.topics}
          />
          <MultiSelectDropdown
            allLabel="Все статусы"
            label="Статусы"
            onChange={(values) => setDialogExportFilters((current) => ({ ...current, statuses: values }))}
            options={(reportFilterOptions.status ?? []).map((status) => ({ label: statusLabels[status] ?? status, value: status }))}
            selected={dialogExportFilters.statuses}
          />
          <MultiSelectDropdown
            allLabel="Все оценки"
            label="Оценки"
            onChange={(values) => setDialogExportFilters((current) => ({ ...current, scores: values }))}
            options={dialogExportScoreOptions}
            selected={dialogExportFilters.scores}
          />
          <label>
            <span>Формат</span>
            <select
              aria-label="Формат выгрузки диалогов"
              className="inline-select"
              data-testid="dialog-export-format"
              onChange={(event) => setDialogExportFormat(event.target.value)}
              value={dialogExportFormat}
            >
              {dialogExportFormatOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button
            className="primary-action"
            data-testid="dialog-export-run"
            disabled={!access.canExportReports || dialogExportBusy}
            onClick={handleCreateDialogExport}
            title={access.canExportReports ? "Сформировать файл и скачать" : access.reason}
            type="button"
          >
            <Download size={17} />
            {dialogExportBusy ? "Формируем..." : "Выгрузить диалоги"}
          </button>
        </div>
      </section>

      <section className="work-panel export-queue-panel">
        <SectionTitle title="Очередь и история выгрузок" action="каждый экспорт фиксируется в audit" />
        <div className="export-job-list">
          {!reportExportJobs.length ? <p>Выгрузок пока нет.</p> : null}
          {reportExportJobs.map((job) => (
            <article className={`export-job ${job.statusKey === "error" ? "danger" : ""}`} key={job.id}>
              <header>
                <strong>{job.name}</strong>
                <StatusBadge tone={exportStatusClasses[job.statusKey] ?? "info"}>{job.status}</StatusBadge>
              </header>
              <div className="health-bar"><i style={{ width: `${job.progress ?? 0}%` }} /></div>
              <footer>
                <span>{job.format} · {job.period} · {job.rows} строк</span>
                <div className="export-actions">
                  <button disabled={!access.canExportReports} onClick={() => handleOpenReportAudit(job)} title={access.canExportReports ? "Открыть audit" : access.reason} type="button">Audit</button>
                  {job.statusKey === "ready" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportDownload(job)} title={access.canExportReports ? "Скачать файл" : access.reason} type="button">
                      <Download size={15} />
                      Скачать
                    </button>
                  ) : null}
                  {job.statusKey === "error" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportRetry(job.id)} title={access.canExportReports ? "Повторить экспорт" : access.reason} type="button">
                      <PlayCircle size={15} />
                      Retry
                    </button>
                  ) : null}
                  {job.statusKey === "expired" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportRetry(job.id)} title={access.canExportReports ? "Сгенерировать заново" : access.reason} type="button">
                      <PlayCircle size={15} />
                      Сгенерировать
                    </button>
                  ) : null}
                  {job.statusKey === "queued" || job.statusKey === "running" ? (
                    <button disabled type="button">В процессе</button>
                  ) : null}
                </div>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </ProductScreen>
  );
}

// Компактный мультивыбор для панели выгрузки: пустой выбор трактуется как
// «все значения», список закрывается по клику вне поповера.
function MultiSelectDropdown({ allLabel, label, onChange, options = [], selected = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const list = Array.isArray(options) ? options : [];
  const selectedSet = new Set(selected);
  const summary = !selected.length
    ? allLabel
    : selected.length === 1
      ? (list.find((option) => option.value === selected[0])?.label ?? selected[0])
      : `Выбрано: ${selected.length}`;

  function toggleValue(value) {
    onChange(selectedSet.has(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div className="multi-select" ref={rootRef}>
      <span>{label}</span>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className="inline-select multi-select-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {summary}
      </button>
      {open ? (
        <div aria-label={label} className="multi-select-popover" role="listbox">
          <label className="multi-select-option">
            <span>{allLabel}</span>
            <input checked={!selected.length} onChange={() => onChange([])} type="checkbox" />
          </label>
          {list.map((option) => (
            <label className="multi-select-option" key={option.value}>
              <span>{option.label}</span>
              <input checked={selectedSet.has(option.value)} onChange={() => toggleValue(option.value)} type="checkbox" />
            </label>
          ))}
          {!list.length ? <p className="multi-select-empty">За период значений нет</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ReportFacetSelect({ label, onChange, options = [], value }) {
  if (!Array.isArray(options) || !options.length) {
    return null;
  }

  return (
    <select aria-label={label} className="inline-select" onChange={(event) => onChange(event.target.value)} value={value}>
      <option value="all">Все: {label.toLocaleLowerCase("ru")}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function formatReportTimestamp(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Нет данных" : parsed.toLocaleString("ru-RU");
}
