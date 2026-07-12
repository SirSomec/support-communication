import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("report filter UI contracts", () => {
  it("loads server-provided dimensions and sends the same filters to workspace and export", () => {
    const source = readFileSync(new URL("../src/features/reports/ReportsScreen.jsx", import.meta.url), "utf8");

    for (const dimension of ["operatorId", "outcome", "queueId", "resolutionOutcome", "status", "teamId", "topic"]) {
      assert.match(source, new RegExp(`reportFilterOptions\\.${dimension}`));
    }
    assert.match(source, /fetchReportWorkspace\(\{[\s\S]*\.\.\.reportFilters/);
    assert.match(source, /requestReportExport\(\{[\s\S]*filters:\s*\{[\s\S]*\.\.\.reportFilters/);
    assert.doesNotMatch(source, /\["Все каналы", "SDK", "Telegram", "MAX", "VK"\]/);
  });
});
