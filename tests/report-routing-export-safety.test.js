import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mergeReportOperatorRows } from "../src/features/reports/model/reportBreakdownModel.js";
import { getReportExportAvailability } from "../src/features/reports/model/reportExportSafety.js";

const breakdownSource = readFileSync(new URL("../src/features/reports/components/BreakdownTables.jsx", import.meta.url), "utf8");
const exportDrawerSource = readFileSync(new URL("../src/features/reports/components/ExportCenterDrawer.jsx", import.meta.url), "utf8");
const reportsScreenSource = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");
const workspaceHookSource = readFileSync(new URL("../src/features/reports/hooks/useReportWorkspace.js", import.meta.url), "utf8");

describe("current-query routing breakdown consistency", () => {
  const workloadRows = [
    {
      agentTouches: 7,
      assignedBacklog: 2,
      firstResponseMedianSeconds: 90,
      operatorId: "operator-in-slice",
      operatorName: "Анна Соколова",
      resolved: 5
    }
  ];
  const routingRows = [
    { operatorId: "operator-in-slice", operatorName: "Анна Соколова", transferEvents: 3 },
    { operatorId: "operator-outside-slice", operatorName: "Иван Петров", transferEvents: 11 }
  ];

  it("keeps a valid routing-only or historical operator from the current filtered query", () => {
    const rows = mergeReportOperatorRows(workloadRows, routingRows);

    assert.deepEqual(rows.map((row) => row.id).sort(), ["operator-in-slice", "operator-outside-slice"]);
    assert.equal(rows[0].transfers, 3, "routing evidence still enriches an operator present in the workload slice");
    assert.equal(rows[0].backlog, 2);
    assert.equal(rows[0].touches, 7);
    assert.equal(rows.find((row) => row.id === "operator-outside-slice")?.transfers, 11);
  });

  it("applies selectedOperatorId after merging current-query workload and routing evidence", () => {
    const rows = mergeReportOperatorRows(workloadRows, routingRows, {
      selectedOperatorId: "operator-outside-slice"
    });

    assert.deepEqual(rows.map((row) => row.id), ["operator-outside-slice"]);
    assert.equal(rows[0].transfers, 11);
  });

  it("merges routing rows only when they carry the current query fingerprint", () => {
    assert.match(
      breakdownSource,
      /const routingRows = routing\?\.matchesQuery\s*\?\s*\(routing\.rows \?\? EMPTY_ROWS\)\s*:\s*EMPTY_ROWS/,
      "stale routing rows must not reach the merge"
    );
    assert.match(breakdownSource, /mergeReportOperatorRows\(breakdowns\?\.operators, routingRows,/);
    assert.doesNotMatch(breakdownSource, /restrictToWorkload/);
    assert.doesNotMatch(reportsScreenSource, /restrictToWorkload/);
  });
});

describe("last-known-good report export safety", () => {
  const workspace = { snapshotAt: "2026-08-18T00:00:00.000Z" };

  it("allows export only when the loaded workspace belongs to the current query", () => {
    assert.deepEqual(getReportExportAvailability({
      viewValid: true,
      workspace,
      workspaceMatchesView: true
    }), { disabled: false, reason: "" });

    const mismatch = getReportExportAvailability({
      viewValid: true,
      workspace,
      workspaceMatchesView: false
    });
    assert.equal(mismatch.disabled, true);
    assert.match(mismatch.reason, /предыдущ|выбран|загруз/i);
  });

  it("fingerprints the successful workspace query separately from the live view query", () => {
    assert.match(workspaceHookSource, /const \[workspaceQueryKey, setWorkspaceQueryKey\] = useState\(""\)/);
    assert.match(workspaceHookSource, /setWorkspaceQueryKey\(queryKey\)/);
    assert.match(workspaceHookSource, /const workspaceMatchesView = Boolean\(workspace && workspaceQueryKey === queryKey\)/);
    assert.match(workspaceHookSource, /workspaceMatchesView/);
  });

  it("blocks a last-known-good snapshot after a refresh error and explains why", () => {
    const availability = getReportExportAvailability({
      error: "Gateway timeout",
      viewValid: true,
      workspace,
      workspaceMatchesView: true
    });

    assert.equal(availability.disabled, true);
    assert.match(availability.reason, /последн.*успеш|обновлен/i);
  });

  it("keeps an already-open drawer and its local PDF branch disabled after a fingerprint mismatch", () => {
    assert.match(reportsScreenSource, /workspaceMatchesView:\s*report\.workspaceMatchesView/);
    assert.match(reportsScreenSource, /<ExportCenterDrawer[\s\S]*?disabled=\{exportAvailability\.disabled\}[\s\S]*?disabledReason=\{exportAvailability\.reason\}/);
    assert.match(
      exportDrawerSource,
      /async function createExport\(\)\s*\{\s*if \(disabled\)[\s\S]*?if \(mode === "metrics" && format === "PDF"\)/,
      "the live disabled prop must be checked before opening the browser print dialog"
    );
    assert.match(exportDrawerSource, /disabled=\{disabled \|\| busy \|\|/);
    assert.match(exportDrawerSource, /\{disabled && !error \? <p[^>]*role="status"[\s\S]*?disabledReason/);
  });

  it("shows explicit stale-view and refresh-error messages next to the retained snapshot", () => {
    assert.match(reportsScreenSource, /data-testid="reports-stale-view"[\s\S]*?предыдущему снимку[\s\S]*?Экспорт временно недоступен/);
    assert.match(reportsScreenSource, /data-testid="reports-stale-error"[\s\S]*?последнему успешно полученному снимку[\s\S]*?Экспорт отключён/);
  });
});
