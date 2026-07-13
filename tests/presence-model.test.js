import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PRESENCE_STATUSES,
  PRESENCE_STATUS_NOT_SET_LABEL,
  formatPresenceDuration,
  formatPresenceSeconds,
  isPresenceStatus,
  presenceRangeStartOfToday,
  presenceStatusClass,
  presenceStatusLabel
} from "../src/app/presenceModel.js";

describe("presence model", () => {
  it("describes the six FR §9.4 operator statuses in Russian", () => {
    assert.deepEqual(PRESENCE_STATUSES.map((status) => status.key), [
      "online",
      "busy",
      "wrapping_up",
      "break",
      "unavailable",
      "offline"
    ]);
    assert.equal(presenceStatusLabel("online"), "Онлайн");
    assert.equal(presenceStatusLabel("busy"), "Занят");
    assert.equal(presenceStatusLabel("wrapping_up"), "Завершает диалоги");
    assert.equal(presenceStatusLabel("break"), "В перерыве");
    assert.equal(presenceStatusLabel("unavailable"), "Недоступен");
    assert.equal(presenceStatusLabel("offline"), "Офлайн");
    assert.equal(presenceStatusLabel(""), PRESENCE_STATUS_NOT_SET_LABEL);
    assert.equal(presenceStatusLabel("away"), PRESENCE_STATUS_NOT_SET_LABEL);
  });

  it("maps statuses to css classes with a safe fallback", () => {
    assert.equal(presenceStatusClass("online"), "online");
    assert.equal(presenceStatusClass("wrapping_up"), "wrapping_up");
    assert.equal(presenceStatusClass(""), "unset");
    assert.equal(presenceStatusClass("javascript:alert(1)"), "unset");
    assert.ok(isPresenceStatus("break"));
    assert.ok(!isPresenceStatus("unset"));
  });

  it("formats time-in-status durations for monitoring", () => {
    assert.equal(formatPresenceSeconds(0), "< 1 мин");
    assert.equal(formatPresenceSeconds(59), "< 1 мин");
    assert.equal(formatPresenceSeconds(60), "1 мин");
    assert.equal(formatPresenceSeconds(5 * 60 + 30), "5 мин");
    assert.equal(formatPresenceSeconds(60 * 60), "1 ч 00 мин");
    assert.equal(formatPresenceSeconds(3 * 60 * 60 + 7 * 60), "3 ч 07 мин");
    assert.equal(formatPresenceSeconds(-5), "—");
    assert.equal(formatPresenceSeconds(Number.NaN), "—");
  });

  it("computes the duration from the status start timestamp", () => {
    const nowMs = Date.parse("2026-07-13T12:00:00.000Z");
    assert.equal(formatPresenceDuration("2026-07-13T11:30:00.000Z", nowMs), "30 мин");
    assert.equal(formatPresenceDuration("2026-07-13T09:00:00.000Z", nowMs), "3 ч 00 мин");
    assert.equal(formatPresenceDuration("2026-07-13T12:30:00.000Z", nowMs), "< 1 мин");
    assert.equal(formatPresenceDuration("", nowMs), "—");
    assert.equal(formatPresenceDuration("not-a-date", nowMs), "—");
  });

  it("returns the local start of today as the monitoring window", () => {
    const start = new Date(presenceRangeStartOfToday(new Date("2026-07-13T15:45:00")));
    assert.equal(start.getHours(), 0);
    assert.equal(start.getMinutes(), 0);
    assert.ok(start.getTime() <= Date.now());
  });
});
