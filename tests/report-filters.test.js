import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const commandBarSource = readFileSync(new URL("../src/features/reports/components/ReportCommandBar.jsx", import.meta.url), "utf8");
const filterDrawerSource = readFileSync(new URL("../src/features/reports/components/ReportFilterDrawer.jsx", import.meta.url), "utf8");
const kpiOverviewSource = readFileSync(new URL("../src/features/reports/components/KpiOverview.jsx", import.meta.url), "utf8");
const trendChartSource = readFileSync(new URL("../src/features/reports/components/AccessibleTrendChart.jsx", import.meta.url), "utf8");
const workspaceHookSource = readFileSync(new URL("../src/features/reports/hooks/useReportWorkspace.js", import.meta.url), "utf8");
const routingHookSource = readFileSync(new URL("../src/features/reports/hooks/useRoutingActivity.js", import.meta.url), "utf8");
const reportsScreenSource = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");
const reportsCssSource = readFileSync(new URL("../src/features/reports/reports.css", import.meta.url), "utf8");

describe("report filter component contracts", () => {
  it("keeps period, comparison, refresh, filters and export as accessible command-bar controls", () => {
    assert.match(commandBarSource, /aria-label="Параметры отчета"/);
    assert.match(commandBarSource, /aria-label="Период отчета"/);
    assert.match(commandBarSource, /aria-label="Сравнение периодов"/);
    assert.match(commandBarSource, /onClick=\{onFilters\}[\s\S]*?Фильтры/);
    assert.match(commandBarSource, /onClick=\{onRefresh\}/);
    assert.match(commandBarSource, /onClick=\{onExport\}[\s\S]*?Экспорт/);
    assert.match(commandBarSource, /aria-live="polite"/);
  });

  it("renders a modal filter drawer from server-provided dimensions", () => {
    assert.match(filterDrawerSource, /aria-label="Фильтры отчета"/);
    assert.match(filterDrawerSource, /aria-modal="true"/);
    assert.match(filterDrawerSource, /role="dialog"/);

    for (const dimension of ["channel", "operatorId", "queueId", "resolutionOutcome", "status", "teamId", "topic"]) {
      assert.match(filterDrawerSource, new RegExp(`key: "${dimension}"`), `${dimension} must remain a server facet`);
    }
    assert.match(filterDrawerSource, /optionRows\(options\?\.\[field\.optionsKey\]/);
    assert.match(filterDrawerSource, />Сбросить</);
    assert.match(filterDrawerSource, />Применить</);
    assert.doesNotMatch(filterDrawerSource, /\["Все каналы", "SDK", "Telegram", "MAX", "VK"\]/);
  });

  it("uses split report components instead of re-implementing their controls in the screen", () => {
    for (const component of ["ReportCommandBar", "ReportFilterDrawer", "KpiOverview", "AccessibleTrendChart"]) {
      assert.match(reportsScreenSource, new RegExp(`(?:import|<)${component}`), `ReportsScreen must compose ${component}`);
    }
  });

  it("offers URL-backed KPI and grain controls with an accessible chart and exact tabular fallback", () => {
    assert.match(trendChartSource, /aria-label="Показатель графика"/);
    assert.match(trendChartSource, /aria-label="Периодичность"/);
    assert.match(trendChartSource, /REPORT_TREND_GRAIN_OPTIONS\.map/);
    assert.match(trendChartSource, /metricOptions\.map/);
    assert.match(trendChartSource, /onSelectionChange/);
    assert.match(trendChartSource, /aria-labelledby=/);
    assert.match(trendChartSource, /role="img"/);
    assert.match(trendChartSource, /tabIndex="0"/);
    assert.match(trendChartSource, /ArrowLeft/);
    assert.match(trendChartSource, /ArrowRight/);
    assert.match(trendChartSource, /aria-live="polite"/);
    assert.match(trendChartSource, /Табличные данные графика/);
    assert.match(trendChartSource, /<th scope="col">Период<\/th>/);
    assert.match(trendChartSource, /chart\.series\.map\(\(series\) => <th/);
    assert.match(trendChartSource, /formatChartValue\(row\.values\[series\.key\]/);
    assert.match(trendChartSource, /row\.samples\[series\.key\]/);
    assert.match(trendChartSource, /if \(!Number\.isFinite\(value\)\) return "—"/);
    assert.match(trendChartSource, /contiguousSegments/);

    assert.match(reportsScreenSource, /explorer=\{operations\.trendExplorer\}/);
    assert.match(reportsScreenSource, /selection=\{view\.trend\}/);
    assert.match(reportsScreenSource, /onSelectionChange=\{\(trend\) => setView/);
    assert.doesNotMatch(workspaceHookSource, /view\.trend/, "presentation-only chart changes must not trigger a workspace refetch");
    assert.doesNotMatch(routingHookSource, /view\.trend/, "presentation-only chart changes must not restart routing activity");
    assert.match(reportsCssSource, /@media\s*\(max-width:[^)]+\)[\s\S]*?\.reports-trend-toolbar\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  });

  it("keeps unavailable hero KPIs visible and explains why they cannot be calculated", () => {
    assert.match(kpiOverviewSource, /HERO_METRIC_KEYS\.map/);
    assert.doesNotMatch(kpiOverviewSource, /\.filter\([^\n]*metric\.value\s*!==\s*null/, "unavailable KPIs must not disappear");
    assert.match(kpiOverviewSource, /unavailableReason|Метрика недоступна|Недостаточно/);
  });

  it("does not send an invalid custom range to either report endpoint", () => {
    assert.match(reportsScreenSource, /useReportWorkspace\(view,\s*\{\s*enabled:\s*validation\.valid\s*\}\)/);
    assert.match(reportsScreenSource, /useRoutingActivity\(view,\s*\{\s*enabled:\s*validation\.valid\s*\}\)/);
    for (const source of [workspaceHookSource, routingHookSource]) {
      assert.match(source, /enabled/);
      assert.match(source, /if\s*\(\s*!enabled\s*\)/);
    }
  });

  it("restarts routing activity for every server facet and never exposes rows from the previous query", () => {
    for (const dimension of ["channel", "operatorId", "queueId", "resolutionOutcome", "status", "teamId", "topic"]) {
      assert.match(
        routingHookSource,
        new RegExp(`view\\.filters\\.${dimension}`),
        `routing activity must depend on ${dimension}`
      );
    }
    assert.match(routingHookSource, /dataQueryKey:\s*queryKey/);
    assert.match(routingHookSource, /const matchesQuery = state\.dataQueryKey === queryKey/);
    assert.match(routingHookSource, /rows:\s*matchesQuery \? state\.rows : \[\]/);
    assert.match(routingHookSource, /totals:\s*matchesQuery \? state\.totals : \{\}/);
  });
});
