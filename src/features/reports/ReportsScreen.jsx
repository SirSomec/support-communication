import React, { useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Clock3, Download, Filter, Gauge, PlayCircle } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { ChannelBadge, EntityTable, MetricTile, ProductScreen, SectionTitle, StatusBadge } from "../../ui.jsx";
import {
  exportJobs,
  operators,
  reportBars,
  reportChartBlocks,
  reportColumnOptions,
  reportRows,
  rescueOutcomeSummary,
  rescueReportRows,
  topicOptions
} from "../../data.js";

const reportTeamOptions = ["Все команды", "1-я линия", "Старшие смены", "Финансы", "Администраторы"];
const reportStatusOptions = ["Все статусы", "Новые", "В работе", "Закрытые", "Ожидают", "Спасение"];
const reportSlaOptions = ["Все SLA", "В норме", "Риск", "Просрочено"];
const reportDialogTypeOptions = ["Все типы", "Входящие", "Исходящие", "Proactive", "Бот"];
const exportStatusClasses = {
  ready: "ok",
  running: "info",
  queued: "hold",
  error: "warn",
  expired: "closed"
};
export function ReportsScreen({ onBack, onToast, access }) {
  const [period, setPeriod] = useState("Сегодня");
  const [channel, setChannel] = useState("Все каналы");
  const [reportType, setReportType] = useState("Ежедневный");
  const [operatorFilter, setOperatorFilter] = useState("Все операторы");
  const [topicFilter, setTopicFilter] = useState("Все тематики");
  const [teamFilter, setTeamFilter] = useState("Все команды");
  const [statusFilter, setStatusFilter] = useState("Все статусы");
  const [slaFilter, setSlaFilter] = useState("Все SLA");
  const [dialogTypeFilter, setDialogTypeFilter] = useState("Все типы");
  const [selectedColumns, setSelectedColumns] = useState(reportColumnOptions.map((column) => column.id));
  const [reportExportJobs, setReportExportJobs] = useState(exportJobs);
  const visibleReportColumns = reportColumnOptions.filter((column) => selectedColumns.includes(column.id));
  const reportOperatorOptions = ["Все операторы", ...operators.map((operator) => operator.name)];
  const reportTopicOptions = ["Все тематики", ...topicOptions.slice(0, 8)];

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

  function handleCreateExport() {
    if (!access.canExportReports) {
      return;
    }

    const nextJob = {
      id: `export-${Date.now()}`,
      name: `${reportType}: ${channel}`,
      format: "XLSX",
      period,
      statusKey: "queued",
      status: "В очереди",
      progress: 8,
      requestedBy: "Текущий оператор",
      createdAt: "сейчас",
      rows: 0,
      auditId: `audit-${Math.floor(9000 + Math.random() * 900)}`
    };

    setReportExportJobs((current) => [nextJob, ...current]);
    onToast(`Выгрузка XLSX за период "${period}" поставлена в очередь.`);
  }

  function handleApplyFilters() {
    onToast(`Фильтр применен: ${reportType}, ${period}, ${channel}, ${operatorFilter}, ${topicFilter}, ${teamFilter}, ${statusFilter}, ${slaFilter}, ${dialogTypeFilter}.`);
  }

  function handleExportRetry(jobId) {
    if (!access.canExportReports) {
      return;
    }

    setReportExportJobs((current) => current.map((job) => job.id === jobId
      ? { ...job, statusKey: "running", status: "Повторная подготовка", progress: 28, rows: job.rows || 486 }
      : job
    ));
    onToast("Экспорт поставлен на повторную подготовку.");
  }

  function handleExportDownload(job) {
    if (!access.canExportReports) {
      return;
    }

    onToast(`${job.name}: файл ${job.format} готов к скачиванию.`);
  }

  function getReportCell(row, columnId) {
    if (columnId === "metric") return <strong>{row.metric}</strong>;
    if (columnId === "today") return <span>{row.today}</span>;
    if (columnId === "previous") return <span>{row.previous}</span>;
    if (columnId === "delta") return <b>{row.delta}</b>;
    return <span>{row.status}</span>;
  }

  return (
    <ProductScreen
      title="Отчеты"
      subtitle="Ежедневный отчет, дайджест и выгрузка всех показателей, которые видны в интерфейсе."
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
          <select className="inline-select" value={reportType} onChange={(event) => setReportType(event.target.value)} aria-label="Тип отчета">
            {["Ежедневный", "Дайджест", "CSAT/CSI", "SLA", "Операторы"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canExportReports} onClick={handleCreateExport} title={access.canExportReports ? "Экспорт XLSX" : access.reason}>
            <Download size={17} />
            Экспорт XLSX
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<ClipboardList size={21} />} label="Новых" value="486" detail="+11% к прошлому" />
        <MetricTile icon={<CheckCircle2 size={21} />} label="Закрыто" value="451" detail="93% обработано" />
        <MetricTile icon={<Clock3 size={21} />} label="Первый ответ" value="01:36" detail="лучше на 16 сек" />
        <MetricTile icon={<Gauge size={21} />} label="SLA" value="91%" detail="+4 п.п." />
      </div>

      <div className="screen-toolbar report-toolbar">
        <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Канал отчета">
          {["Все каналы", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)} aria-label="Оператор отчета">
          {reportOperatorOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} aria-label="Тематика отчета">
          {reportTopicOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} aria-label="Команда отчета">
          {reportTeamOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Статус диалога в отчете">
          {reportStatusOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={slaFilter} onChange={(event) => setSlaFilter(event.target.value)} aria-label="SLA отчета">
          {reportSlaOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={dialogTypeFilter} onChange={(event) => setDialogTypeFilter(event.target.value)} aria-label="Тип диалога в отчете">
          {reportDialogTypeOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <button onClick={handleApplyFilters} type="button"><Filter size={17} /> Применить</button>
        <button onClick={() => onToast("История экспортов открыта.")} type="button"><CalendarDays size={17} /> История</button>
      </div>

      <div className="reports-layout">
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
          <SectionTitle title="Дайджест руководителя" action="Автообновление 18:00" />
          <div className="digest-list">
            <p><b>Главный риск:</b> VK просел по SLA до 68%, очередь требует перераспределения.</p>
            <p><b>Топ тематика:</b> доставка и статус заказа, 34% всех обращений.</p>
            <p><b>Контроль качества:</b> низких оценок 7, все попали в фильтр старшего.</p>
          </div>
        </section>
      </div>

      <section className="work-panel report-charts-panel">
        <SectionTitle title="Chart-блоки отчета" action="нагрузка, SLA, качество, rescue" />
        <div className="report-chart-grid">
          {reportChartBlocks.map((chart) => (
            <article className={`report-chart-card ${chart.tone}`} key={chart.id}>
              <header>
                <strong>{chart.title}</strong>
                <span>{chart.delta}</span>
              </header>
              <b>{chart.value}</b>
              <div className="mini-chart" aria-label={chart.title} role="img">
                {chart.points.map((point, index) => (
                  <i style={{ height: `${Math.max(18, point)}%` }} key={`${chart.id}-${index}`} />
                ))}
              </div>
              <footer>
                {chart.legend.map((item) => <span key={item}>{item}</span>)}
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel rescue-report-panel">
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
      </section>

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
        as="div"
        className="report-table"
        columns={visibleReportColumns}
        headClassName="report-dynamic-row"
        headStyle={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}
      >
        {reportRows.map((row) => (
          <div className="entity-row report-dynamic-row" key={row.metric} style={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}>
            {visibleReportColumns.map((column) => <React.Fragment key={column.id}>{getReportCell(row, column.id)}</React.Fragment>)}
          </div>
        ))}
      </EntityTable>

      <section className="work-panel export-queue-panel">
        <SectionTitle title="Очередь и история выгрузок" action="каждый экспорт фиксируется в audit" />
        <div className="export-job-list">
          {reportExportJobs.map((job) => (
            <article className={`export-job ${job.statusKey === "error" ? "danger" : ""}`} key={job.id}>
              <header>
                <strong>{job.name}</strong>
                <StatusBadge tone={exportStatusClasses[job.statusKey] ?? "info"}>{job.status}</StatusBadge>
              </header>
              <div className="health-bar"><i style={{ width: `${job.progress}%` }} /></div>
              <footer>
                <span>{job.format} · {job.period} · {job.rows} строк</span>
                <div className="export-actions">
                  <button disabled={!access.canExportReports} onClick={() => onToast(`${job.name}: audit ${job.auditId}`)} title={access.canExportReports ? "Открыть audit" : access.reason} type="button">Audit</button>
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
