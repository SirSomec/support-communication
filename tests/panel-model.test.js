import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PANEL_WORKLOAD_PERIODS,
  createShiftDraft,
  presenceRangeForDate,
  resolveShiftSummary,
  workloadPeriodLabel
} from "../src/features/panel/panelModel.js";

describe("shift panel model", () => {
  it("builds a local calendar-day interval for time in statuses", () => {
    const range = presenceRangeForDate("2026-08-20");
    assert.ok(range);

    const from = new Date(range.from);
    const to = new Date(range.to);
    assert.equal(from.getHours(), 0);
    assert.equal(from.getMinutes(), 0);
    assert.equal(to.getHours(), 0);
    assert.equal(to.getMinutes(), 0);
    assert.equal(to.getTime() - from.getTime(), 24 * 60 * 60 * 1_000);
  });

  it("rejects malformed and impossible status dates", () => {
    assert.equal(presenceRangeForDate("2026-02-31"), null);
    assert.equal(presenceRangeForDate("20.08.2026"), null);
    assert.equal(presenceRangeForDate(""), null);
  });

  it("counts only explicitly configured shift members", () => {
    const summary = resolveShiftSummary(
      { operatorIds: ["op-1", "op-3"] },
      [
        { id: "op-1", status: "online" },
        { id: "op-2", status: "online" },
        { id: "op-3", status: "break" }
      ]
    );

    assert.equal(summary.memberCount, 2);
    assert.equal(summary.members.length, 2);
    assert.equal(summary.onLineCount, 1);
    assert.equal(summary.breakCount, 1);
  });

  it("exposes explicit workload periods and a usable default shift draft", () => {
    assert.deepEqual(PANEL_WORKLOAD_PERIODS.map((period) => period.value), ["live", "hour", "today", "7days", "30days"]);
    assert.equal(workloadPeriodLabel("7days"), "7 дней");

    const draft = createShiftDraft(null, new Date("2026-08-20T10:15:00"));
    assert.equal(draft.name, "Текущая смена");
    assert.equal(draft.startsAt, "2026-08-20T10:15");
    assert.equal(draft.endsAt, "2026-08-20T18:15");
  });
});
