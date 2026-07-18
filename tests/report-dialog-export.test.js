import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("dialog transcript export UI contracts", () => {
  const source = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");

  it("requests the dialog transcript export with its own filters and format", () => {
    assert.match(source, /reportType: "dialog_transcripts"/);
    assert.match(source, /format: dialogExportFormat/);
    assert.match(source, /requestReportExport\(\{[\s\S]*?\.\.\.dialogExportFilters/);
    for (const dimension of ["operatorIds", "scores", "statuses"]) {
      assert.match(
        source,
        new RegExp(`current, ${dimension}: values`),
        `dialog export must collect multi-value ${dimension}`
      );
    }
    assert.match(source, /current, topic: value/);
  });

  it("lets the user pick several operators, statuses and scores at once", () => {
    assert.match(source, /function MultiSelectDropdown/);
    const multiSelectUsages = source.match(/<MultiSelectDropdown/g) ?? [];
    assert.equal(multiSelectUsages.length, 3, "operators, statuses and scores must be multi-selects");
    assert.match(source, /label: operator\.name, value: operator\.id/, "operator options must show names, not ids");
    assert.match(source, /statusLabels\[status\] \?\? status/, "status options must show human labels");
    assert.match(source, /value: "none"/, "unrated dialogs must be selectable");
  });

  it("offers its own export period including a custom date range", () => {
    assert.match(source, /data-testid="dialog-export-period"/);
    assert.match(source, /value: "range"/);
    assert.match(source, /dateFrom: dialogExportRange\.from, dateTo: dialogExportRange\.to/);
    assert.match(source, /type="date"/);
  });

  it("offers all four export formats", () => {
    for (const format of ["XLSX", "HTML", "JSON", "TXT"]) {
      assert.match(source, new RegExp(`value: "${format}"`), `${format} must be offered`);
    }
    assert.match(source, /data-testid="dialog-export-panel"/);
    assert.match(source, /data-testid="dialog-export-run"/);
  });

  it("downloads the file right away when the export job is materialized as ready", () => {
    assert.match(source, /statusKey === "ready"[\s\S]*?handleExportDownload\(job\)/);
  });
});
