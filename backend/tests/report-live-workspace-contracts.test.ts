import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLiveReportWorkspace,
  type LiveReportConversation
} from "../apps/api-gateway/src/reports/report-live-workspace.ts";

const NOW = "2026-07-10T12:00:00.000Z";

describe("live report workspace contracts", () => {
  it("aggregates tenant-ready rows across current and equal previous windows", () => {
    const workspace = buildLiveReportWorkspace([
      conversation("today-open", "2026-07-10T08:00:00.000Z"),
      conversation("today-closed", "2026-07-10T09:00:00.000Z", { closedAt: "2026-07-10T11:00:00.000Z", status: "closed" }),
      conversation("yesterday", "2026-07-09T08:00:00.000Z", { closedAt: "2026-07-09T10:00:00.000Z", status: "closed" })
    ], { now: NOW, period: "Сегодня" });

    assert.equal(workspace.period, "today");
    assert.deepEqual(workspace.current, {
      closedConversations: 1,
      firstResponseSamples: 2,
      firstResponseSeconds: 60,
      newConversations: 2,
      slaPercent: 100,
      slaSamples: 2,
      slaViolations: 0
    });
    assert.equal(workspace.previous.newConversations, 1);
    assert.equal(workspace.previous.closedConversations, 1);
    assert.deepEqual(workspace.windows.current, {
      from: "2026-07-10T00:00:00.000Z",
      to: "2026-07-11T00:00:00.000Z"
    });
    assert.equal(workspace.rows.length, 4);
    assert.equal(workspace.chartBlocks.length, 3);
    assert.deepEqual(workspace.chartBlocks[0].series.map((series) => series.points), [[2], [1]]);
  });

  it("supports yesterday, seven-day and thirty-day periods with non-overlapping equal windows", () => {
    const rows = [
      conversation("yesterday", "2026-07-09T08:00:00.000Z"),
      conversation("seven-current-edge", "2026-07-04T00:00:00.000Z"),
      conversation("seven-previous-edge", "2026-07-03T23:59:59.999Z"),
      conversation("thirty-current-edge", "2026-06-11T00:00:00.000Z"),
      conversation("thirty-previous", "2026-06-10T23:59:59.999Z")
    ];

    const yesterday = buildLiveReportWorkspace(rows, { now: NOW, period: "yesterday" });
    const sevenDays = buildLiveReportWorkspace(rows, { now: NOW, period: "7_days" });
    const thirtyDays = buildLiveReportWorkspace(rows, { now: NOW, period: "30 дней" });

    assert.equal(yesterday.current.newConversations, 1);
    assert.equal(yesterday.previous.newConversations, 0);
    assert.equal(sevenDays.current.newConversations, 2);
    assert.equal(sevenDays.previous.newConversations, 1);
    assert.equal(thirtyDays.current.newConversations, 4);
    assert.equal(thirtyDays.previous.newConversations, 1);
    assert.equal(sevenDays.chartBlocks[0].labels.length, 7);
    assert.equal(thirtyDays.chartBlocks[0].labels.length, 30);
  });

  it("filters channels case-insensitively and calculates channel shares from current new conversations", () => {
    const rows = [
      conversation("sdk-1", "2026-07-10T08:00:00.000Z", { channel: "SDK" }),
      conversation("sdk-2", "2026-07-10T09:00:00.000Z", { channel: "SDK" }),
      conversation("telegram", "2026-07-10T10:00:00.000Z", { channel: "Telegram" }),
      conversation("old-vk", "2026-07-09T10:00:00.000Z", { channel: "VK" })
    ];

    const all = buildLiveReportWorkspace({ conversations: rows, channel: "Все каналы", now: NOW, period: "today" });
    const sdk = buildLiveReportWorkspace(rows, { channel: "sdk", now: NOW });

    assert.deepEqual(all.bars, [["SDK", 66.7], ["Telegram", 33.3]]);
    assert.equal(sdk.current.newConversations, 2);
    assert.deepEqual(sdk.bars, [["SDK", 100]]);
  });

  it("measures the first agent reply after the first client message and ignores non-dialog messages", () => {
    const row = conversation("response-order", "2026-07-10T08:00:00.000Z", {
      messages: [
        { createdAt: "2026-07-10T07:59:00.000Z", id: "early-agent", side: "agent", text: "proactive", time: "07:59" },
        { createdAt: "2026-07-10T08:00:00.000Z", id: "client", side: "client", text: "help", time: "08:00" },
        { createdAt: "2026-07-10T08:01:00.000Z", id: "event", text: "assigned", time: "08:01", type: "event" },
        { createdAt: "2026-07-10T08:02:30.000Z", id: "agent", side: "agent", text: "reply", time: "08:02" },
        { createdAt: "2026-07-10T08:03:00.000Z", id: "agent-2", side: "agent", text: "more", time: "08:03" }
      ]
    });
    const breached = conversation("breached", "2026-07-10T09:00:00.000Z", { slaTone: "critical" });

    const workspace = buildLiveReportWorkspace([row, breached], { now: NOW });

    assert.equal(workspace.current.firstResponseSamples, 2);
    assert.equal(workspace.current.firstResponseSeconds, 105);
    assert.equal(workspace.current.slaViolations, 1);
    assert.equal(workspace.current.slaPercent, 50);
    assert.equal(workspace.rows.find((item) => item.key === "firstResponseSeconds")?.current, "01:45");
  });

  it("returns zero metrics, empty channel bars and zero-valued honest charts for empty input", () => {
    const workspace = buildLiveReportWorkspace([], { now: NOW, period: "7days" });

    assert.deepEqual(workspace.current, {
      closedConversations: 0,
      firstResponseSamples: 0,
      firstResponseSeconds: 0,
      newConversations: 0,
      slaPercent: 0,
      slaSamples: 0,
      slaViolations: 0
    });
    assert.deepEqual(workspace.previous, workspace.current);
    assert.deepEqual(workspace.bars, []);
    assert.equal(workspace.rows.every((row) => row.current === "0" || row.current === "00:00" || row.current === "0%"), true);
    assert.equal(workspace.chartBlocks.every((chart) => chart.series.every((series) => series.points.every((point) => point === 0))), true);
  });
});

function conversation(
  id: string,
  createdAt: string,
  overrides: Partial<LiveReportConversation> = {}
): LiveReportConversation {
  return {
    channel: "SDK",
    createdAt,
    messages: [
      { createdAt, id: `${id}-client`, side: "client", text: "Question", time: "08:00" },
      { createdAt: new Date(Date.parse(createdAt) + 60_000).toISOString(), id: `${id}-agent`, side: "agent", text: "Answer", time: "08:01" }
    ],
    slaTone: "ok",
    status: "active",
    updatedAt: createdAt,
    ...overrides
  };
}
