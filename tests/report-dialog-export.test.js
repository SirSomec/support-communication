import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("dialog transcript export UI contracts", () => {
  const source = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");

  it("requests the dialog transcript export with its own filters and format", () => {
    assert.match(source, /reportType: "dialog_transcripts"/);
    assert.match(source, /format: dialogExportFormat/);
    assert.match(source, /requestReportExport\(\{[\s\S]*?\.\.\.dialogExportFilters/);
    for (const dimension of ["operatorId", "score", "status", "topic"]) {
      assert.match(
        source,
        new RegExp(`dialogExportFilters, ${dimension}: value|current, ${dimension}: (value|event\\.target\\.value)|\\{ \\.\\.\\.current, ${dimension}:`),
        `dialog export must let the user change the ${dimension} filter`
      );
    }
  });

  it("offers all four export formats and the rating filter including unrated", () => {
    for (const format of ["XLSX", "HTML", "JSON", "TXT"]) {
      assert.match(source, new RegExp(`value: "${format}"`), `${format} must be offered`);
    }
    assert.match(source, /value: "none"/, "unrated dialogs must be selectable");
    assert.match(source, /data-testid="dialog-export-panel"/);
    assert.match(source, /data-testid="dialog-export-run"/);
  });

  it("downloads the file right away when the export job is materialized as ready", () => {
    assert.match(source, /statusKey === "ready"[\s\S]*?handleExportDownload\(job\)/);
  });
});
