import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const exportCenterUrl = new URL("../src/features/reports/components/ExportCenterDrawer.jsx", import.meta.url);
const componentDirectory = new URL("../src/features/reports/components/", import.meta.url);
const source = readdirSync(componentDirectory)
  .filter((name) => name.endsWith(".jsx"))
  .map((name) => readFileSync(new URL(name, componentDirectory), "utf8"))
  .join("\n");

describe("report export center contracts", () => {
  it("exposes the export workflow as an accessible dialog or labelled panel", () => {
    assert.equal(existsSync(exportCenterUrl), true, "exports belong in their own report component");
    assert.match(source, /(?:aria-label="Экспорт отчетов"|data-testid="dialog-export-panel")/);
    assert.match(source, /(?:role="dialog"|data-testid="dialog-export-panel")/);
  });

  it("offers complete dashboard snapshots in XLSX, CSV and JSON plus printable PDF", () => {
    for (const format of ["XLSX", "CSV", "JSON"]) {
      assert.match(source, new RegExp(`(?:value:\\s*"${format}"|[>\"]${format}[<\"])`), `${format} must be offered`);
    }
    assert.match(source, /(?:Печать|PDF|window\.print)/i);
  });

  it("uses the exact dashboard period, timezone and active filters for every server export", () => {
    assert.match(source, /const query = reportWorkspaceQuery\(view\)/);
    assert.match(source, /filters:\s*\{[\s\S]*?\.\.\.query,[\s\S]*?snapshotAt/);
    assert.match(source, /requestReportExport\(\{/);
    assert.match(source, /reportType:[\s\S]*?"support_operations"[\s\S]*?"dialog_transcripts"/);
    assert.doesNotMatch(source, /dialogExportPeriod|dialogExportRange/, "transcripts must not silently switch to a different window");
  });

  it("offers all four export formats", () => {
    for (const format of ["XLSX", "HTML", "JSON", "TXT"]) {
      assert.match(source, new RegExp(`["']${format}["']`), `${format} must be offered`);
    }
    assert.match(source, /data-testid="dialog-export-panel"/);
    assert.match(source, /["']dialog-export-run["']/);
  });

  it("keeps progress, retry, download and immutable audit affordances together", () => {
    assert.match(source, /statusKey === "ready"[\s\S]*?onDownload\(job\)/);
    assert.match(source, /(?:Retry|Повторить|Сгенерировать заново)/);
    assert.match(source, /role="progressbar"/);
    assert.match(source, /(?:audit|аудит|Audit ID)/i);
    assert.match(source, /report-export-history-panel/);
    assert.match(source, /report-audit-panel/);
  });
});
