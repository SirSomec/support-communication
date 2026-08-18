import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, CircleAlert, Database, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { ProductScreen, Skeleton, WorkspaceState } from "../../ui.jsx";
import { AccessibleTrendChart } from "./components/AccessibleTrendChart.jsx";
import { BreakdownTables } from "./components/BreakdownTables.jsx";
import { ExportCenterDrawer } from "./components/ExportCenterDrawer.jsx";
import { InsightsRail } from "./components/InsightsRail.jsx";
import { KpiOverview } from "./components/KpiOverview.jsx";
import { MetricGlossaryDrawer } from "./components/MetricGlossaryDrawer.jsx";
import { OperationalDiagnostics } from "./components/OperationalDiagnostics.jsx";
import { QueueHealthPanel } from "./components/QueueHealthPanel.jsx";
import { ReportCommandBar } from "./components/ReportCommandBar.jsx";
import { ReportFilterDrawer } from "./components/ReportFilterDrawer.jsx";
import { ServiceLevelPanel } from "./components/ServiceLevelPanel.jsx";
import { useReportWorkspace } from "./hooks/useReportWorkspace.js";
import { useRoutingActivity } from "./hooks/useRoutingActivity.js";
import { getReportExportAvailability } from "./model/reportExportSafety.js";
import { persistReportView, reportViewFromLocation, validateReportView } from "./model/reportViewState.js";
import "./reports.css";

export function ReportsScreen({ onBack, onToast, access }) {
  const [view, setView] = useState(() => reportViewFromLocation());
  const validation = useMemo(() => validateReportView(view), [view]);
  const report = useReportWorkspace(view, { enabled: validation.valid });
  const routing = useRoutingActivity(view, { enabled: validation.valid });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    persistReportView(view);
  }, [view]);

  useEffect(() => {
    if (!report.workspace?.exportJobs) return;
    setJobs((current) => mergeExportJobs(report.workspace.exportJobs, current));
  }, [report.workspace?.exportJobs]);

  useEffect(() => {
    const pending = jobs.some((job) => job.statusKey === "queued" || job.statusKey === "running");
    if (!pending || !validation.valid) return undefined;
    const timer = window.setInterval(report.refresh, 3_000);
    return () => window.clearInterval(timer);
  }, [jobs, report.refresh, validation.valid]);

  const workspace = report.workspace;
  const operations = workspace?.operations;
  const sourceDiagnostics = operations?.source && typeof operations.source === "object" ? operations.source : {};
  const exportAvailability = getReportExportAvailability({
    error: report.error,
    refreshing: report.refreshing,
    viewValid: validation.valid,
    workspace,
    workspaceMatchesView: report.workspaceMatchesView
  });
  const stateItems = workspace ? [
    { label: "Снимок", tone: report.stale ? "warn" : "ok", value: formatTimestamp(workspace.snapshotAt || report.receivedAt) },
    { label: "Модель", tone: operations?.version === "support-ops/v2" ? "ok" : "partial", value: operations?.version ?? "—" },
    { label: "Источник", tone: Number(sourceDiagnostics.rowsWithLifecycleEvents) > 0 ? "ok" : "empty", value: `${formatInteger(sourceDiagnostics.rowCount)} обращ.` }
  ] : [];

  function upsertJob(job) {
    if (!job?.id) return;
    setJobs((current) => mergeExportJobs([job], current));
  }

  return (
    <ProductScreen
      actions={<button className="reports-method-button" onClick={() => setGlossaryOpen(true)} type="button"><BookOpen aria-hidden="true" size={16} />Методика</button>}
      onBack={onBack}
      stateItems={stateItems}
      subtitle="Операционный обзор спроса, скорости, качества и здоровья очереди"
      title="Отчеты"
    >
      <ReportCommandBar
        exporting={exportAvailability.disabled}
        onExport={() => setExportOpen(true)}
        onFilters={() => setFiltersOpen(true)}
        onRefresh={report.refresh}
        onViewChange={setView}
        refreshing={report.refreshing}
        view={view}
      />

      {!validation.valid ? <div className="reports-state-banner is-error" role="alert"><CircleAlert aria-hidden="true" size={17} /><span><strong>Период не применён.</strong>{validation.message}</span></div> : null}
      {!report.online ? <div className="reports-state-banner is-warning" role="status"><WifiOff aria-hidden="true" size={17} /><span><strong>Нет подключения.</strong>Показан последний успешно полученный снимок.</span></div> : null}
      {report.error && workspace ? <div className="reports-state-banner is-error" data-testid="reports-stale-error" role="alert"><CircleAlert aria-hidden="true" size={17} /><span><strong>Не удалось обновить данные.</strong>{report.error} KPI относятся к последнему успешно полученному снимку{report.workspaceMatchesView ? "." : " для предыдущих параметров."} Экспорт отключён до успешного обновления.</span><button onClick={report.refresh} type="button">Повторить</button></div> : null}
      {workspace && !report.workspaceMatchesView && validation.valid && !report.error ? <div className="reports-state-banner is-warning" data-testid="reports-stale-view" role="status"><RefreshCw aria-hidden="true" className={report.refreshing ? "spin" : ""} size={14} /><span><strong>Применяем выбранные параметры.</strong>KPI ниже относятся к предыдущему снимку. Экспорт временно недоступен.</span></div> : null}
      {report.refreshing && workspace && report.workspaceMatchesView ? <div className="reports-refresh-note" role="status"><RefreshCw aria-hidden="true" className="spin" size={14} />Обновляем снимок, текущие данные остаются на экране</div> : null}

      {report.loading && !workspace ? <ReportsSkeleton /> : null}
      {!report.loading && !workspace && report.error ? <WorkspaceState actionLabel="Повторить" description={report.error} onAction={report.refresh} title="Не удалось загрузить отчёт" tone="error" /> : null}

      {workspace ? (
        <div className="reports-workspace">
          <KpiOverview compare={view.compare} definitions={operations.definitions} metrics={operations.metrics} />

          <div className="reports-evidence-layout">
            <main className="reports-primary-evidence">
              <section className="reports-panel reports-trend-panel">
                <AccessibleTrendChart
                  explorer={operations.trendExplorer}
                  onSelectionChange={(trend) => setView((current) => ({ ...current, trend }))}
                  selection={view.trend}
                />
              </section>
              <div className="reports-diagnostic-grid">
                <ServiceLevelPanel serviceLevel={operations.serviceLevel} />
                <QueueHealthPanel ageBuckets={operations.backlogAge} metrics={operations.metrics} />
              </div>
              <OperationalDiagnostics definitions={operations.definitions} metrics={operations.metrics} />
            </main>
            <InsightsRail insights={operations.insights} metrics={operations.metrics} />
          </div>

          <BreakdownTables
            breakdowns={operations.breakdowns}
            operatorId={view.filters.operatorId === "all" ? null : view.filters.operatorId}
            routing={report.workspaceMatchesView ? routing : null}
          />

          <footer className="reports-evidence-footer">
            <div><Database aria-hidden="true" size={16} /><span><strong>Источник: события обращений и сообщений</strong><small>Снимок {formatTimestamp(workspace.snapshotAt)} · {formatInteger(sourceDiagnostics.rowCount)} строк</small></span></div>
            <p>FCR, AHT, occupancy и стоимость решения не выводятся без необходимой телеметрии. Отсутствующее измерение обозначается «—».</p>
            <button onClick={() => setGlossaryOpen(true)} type="button"><ShieldCheck aria-hidden="true" size={16} />Качество и определения</button>
          </footer>
        </div>
      ) : null}

      {filtersOpen ? <ReportFilterDrawer onApply={(filters) => setView((current) => ({ ...current, filters }))} onClose={() => setFiltersOpen(false)} options={workspace?.filterOptions} view={view} /> : null}
      {exportOpen ? <ExportCenterDrawer access={access} disabled={exportAvailability.disabled} disabledReason={exportAvailability.reason} jobs={jobs} onClose={() => setExportOpen(false)} onJobCreated={upsertJob} onRefresh={report.refresh} onToast={onToast} view={view} workspace={workspace} /> : null}
      {glossaryOpen ? <MetricGlossaryDrawer dataQuality={workspace?.dataQuality} definitions={operations?.definitions} onClose={() => setGlossaryOpen(false)} snapshotAt={workspace?.snapshotAt} source={operations?.source} /> : null}
    </ProductScreen>
  );
}

function ReportsSkeleton() {
  return (
    <div aria-label="Загрузка отчета" className="reports-skeleton" role="status">
      <div>{Array.from({ length: 8 }, (_, index) => <Skeleton height={146} key={index} />)}</div>
      <Skeleton height={360} />
      <div><Skeleton height={310} /><Skeleton height={310} /></div>
    </div>
  );
}

function mergeExportJobs(priority, fallback) {
  const map = new Map();
  for (const job of [...(priority ?? []), ...(fallback ?? [])]) {
    if (job?.id && !map.has(job.id)) map.set(job.id, job);
  }
  return [...map.values()];
}

function formatTimestamp(value) {
  const numeric = typeof value === "number" ? value : Date.parse(String(value ?? ""));
  return Number.isFinite(numeric) ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" }).format(numeric) : "—";
}

function formatInteger(value) {
  return Number.isFinite(Number(value)) ? new Intl.NumberFormat("ru-RU").format(Number(value)) : "—";
}
