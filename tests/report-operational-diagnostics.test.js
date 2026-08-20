import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const componentUrl = new URL("../src/features/reports/components/OperationalDiagnostics.jsx", import.meta.url);
const reportsScreenSource = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");
const reportsCssSource = readFileSync(new URL("../src/features/reports/reports.css", import.meta.url), "utf8");
const metricRegistrySource = readFileSync(new URL("../src/features/reports/model/reportMetricRegistry.js", import.meta.url), "utf8");
const tooltipUrl = new URL("../src/features/reports/components/ReportInfoTooltip.jsx", import.meta.url);

describe("reports operational diagnostics contracts", () => {
  it("composes a dedicated operational diagnostics section in the report workspace", () => {
    assert.equal(existsSync(componentUrl), true, "operational diagnostics belong in a dedicated report component");
    const componentSource = readFileSync(componentUrl, "utf8");
    const usage = reportsScreenSource.match(/<OperationalDiagnostics\b[\s\S]*?\/>/)?.[0] ?? "";

    assert.match(reportsScreenSource, /import\s+\{\s*OperationalDiagnostics\s*\}\s+from\s+"\.\/components\/OperationalDiagnostics\.jsx"/);
    assert.match(usage, /metrics=\{operations\.metrics\}/);
    assert.match(usage, /definitions=\{operations\.definitions\}/);
    assert.match(componentSource, /export function OperationalDiagnostics/);
  });

  it("exposes the section through a stable test id and a real accessible name", () => {
    const componentSource = readFileSync(componentUrl, "utf8");
    const sectionTag = componentSource.match(/<section\b[\s\S]*?>/)?.[0] ?? "";
    const labelledBy = sectionTag.match(/aria-labelledby="([^"]+)"/)?.[1] ?? "";

    assert.match(sectionTag, /data-testid="reports-operational-diagnostics"/);
    assert.notEqual(labelledBy, "", "the diagnostic section must reference a visible heading");
    assert.match(componentSource, new RegExp(`id=["']${escapeRegExp(labelledBy)}["']`));
  });

  it("keeps every required operational KPI visible", () => {
    const componentSource = readFileSync(componentUrl, "utf8");
    for (const metricKey of [
      "flowRatio",
      "waiting",
      "overdue",
      "responseCoverage",
      "csatCoverage",
      "oneTouchRate",
      "nextResponseMedianSeconds",
      "nextResponseP90Seconds",
      "internalComments"
    ]) {
      assert.match(componentSource, new RegExp(`["']${metricKey}["']`), `${metricKey} must remain visible in operational diagnostics`);
    }
    assert.match(metricRegistrySource, /csatCoverage:\s*\{[^}]*label:\s*"Покрытие CSAT"/);
  });

  it("renders unavailable values honestly and explains missing measurement data", () => {
    const componentSource = readFileSync(componentUrl, "utf8");

    assert.match(componentSource, /formatReportMetric\(/, "metric values must use the null-safe report formatter");
    assert.match(componentSource, /Недостаточно данных/);
    assert.match(componentSource, /value\s*===\s*null|value\s*==\s*null|value\s*===\s*undefined/);
    assert.doesNotMatch(componentSource, /metric\.value\s*\|\|\s*0/, "a missing metric must never be converted to a real zero");
  });

  it("shows sample and denominator evidence instead of presenting estimates without context", () => {
    const componentSource = readFileSync(componentUrl, "utf8");

    assert.match(componentSource, /sampleSize/);
    assert.match(componentSource, /denominator/);
    assert.match(componentSource, /numerator/);
    assert.match(componentSource, /n\s*=|Основание|из\s*\$?\{/);
  });

  it("uses responsive diagnostic groups and metric cards", () => {
    const componentSource = readFileSync(componentUrl, "utf8");

    for (const className of [
      "reports-operational-diagnostics",
      "reports-diagnostic-groups",
      "reports-diagnostic-metric"
    ]) {
      assert.match(componentSource, new RegExp(`className=[^\n>]*${className}`));
      assert.match(reportsCssSource, new RegExp(`\\.${className}\\b`));
    }
    assert.match(reportsCssSource, /@media\s*\(max-width:[^)]+\)[\s\S]*?\.reports-diagnostic-groups\b/);
  });

  it("uses a shared interactive tooltip for metric definitions", () => {
    const componentSource = readFileSync(componentUrl, "utf8");
    const tooltipSource = readFileSync(tooltipUrl, "utf8");
    const kpiSource = readFileSync(new URL("../src/features/reports/components/KpiOverview.jsx", import.meta.url), "utf8");

    assert.equal(existsSync(tooltipUrl), true);
    assert.match(componentSource, /<ReportInfoTooltip/);
    assert.match(kpiSource, /<ReportInfoTooltip/);
    assert.match(tooltipSource, /role="tooltip"/);
    assert.match(tooltipSource, /onPointerEnter/);
    assert.match(tooltipSource, /onClick=/);
    assert.match(tooltipSource, /event\.key !== "Escape"/);
  });
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
