import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildConversationReportDataQuality,
  buildConversationReportEventWatermark,
  buildConversationReportFilterOptions,
  filterReportConversations,
  type ConversationReportFilters
} from "../apps/api-gateway/src/reports/report-conversation-filters.ts";
import type { ConversationReportSourceRow } from "../apps/api-gateway/src/reports/report.repository.ts";

const rows: ConversationReportSourceRow[] = [
  conversation("conv-1", "Telegram", "operator-anna", "assigned", "delivery", [
    event("conversation.created", "2026-07-11T06:00:00.000Z", { backfilled: true }, "migration.backfill", "2026-07-11T07:00:00.000Z"),
    event("assignment.changed", "2026-07-11T06:10:00.000Z", { queueId: "telegram", teamId: "line-1", toOperatorId: "operator-anna", toStatus: "assigned" }),
    event("rescue.resolved", "2026-07-11T06:20:00.000Z", { outcome: "saved" })
  ]),
  conversation("conv-2", "SDK", "operator-boris", "closed", "payment", [
    event("conversation.created", "2026-07-11T06:30:00.000Z"),
    event("status.changed", "2026-07-11T06:50:00.000Z", { resolutionOutcome: "resolved", toStatus: "closed", toTopic: "payment" })
  ])
];

describe("conversation report filters", () => {
  it("filters the same source rows by persisted report dimensions", () => {
    assert.deepEqual(filterReportConversations(rows, { operatorId: "operator-anna" }).map((row) => row.id), ["conv-1"]);
    assert.deepEqual(filterReportConversations(rows, { topic: "PAYMENT", status: "closed" }).map((row) => row.id), ["conv-2"]);
    assert.deepEqual(filterReportConversations(rows, { outcome: "saved" }).map((row) => row.id), ["conv-1"]);
    assert.deepEqual(filterReportConversations(rows, { resolutionOutcome: "resolved" }).map((row) => row.id), ["conv-2"]);
    assert.deepEqual(filterReportConversations(rows, { queueId: "telegram", teamId: "line-1" }).map((row) => row.id), ["conv-1"]);
    assert.equal(filterReportConversations(rows, { operatorId: "all" }).length, 2);
    assert.equal(filterReportConversations(rows, { channel: "SDK", period: "today" } as ConversationReportFilters).length, 2);
  });

  it("builds filter choices only from dimensions present in the journal", () => {
    const options = buildConversationReportFilterOptions(rows);
    assert.deepEqual(options.operatorId, ["operator-anna", "operator-boris"]);
    assert.deepEqual(options.topic, ["delivery", "payment"]);
    assert.deepEqual(options.queueId, ["telegram"]);
    assert.deepEqual(options.teamId, ["line-1"]);
    assert.deepEqual(options.outcome, ["saved"]);
    assert.deepEqual(options.resolutionOutcome, ["resolved"]);
  });

  it("reports event counts, freshness and the backfill boundary", () => {
    const quality = buildConversationReportDataQuality(rows, new Date("2026-07-11T07:01:00.000Z"));
    assert.equal(quality.eventCount, 5);
    assert.equal(quality.conversationCount, 2);
    assert.equal(quality.complete, false);
    assert.equal(quality.backfillBoundary, "2026-07-11T07:00:00.000Z");
    assert.equal(quality.latestEventAt, "2026-07-11T06:50:00.000Z");
    assert.equal(quality.freshnessLagSeconds, 60);
    assert.deepEqual(quality.dimensionCoverage, {
      queueId: { known: 1, unknown: 1 },
      resolutionOutcome: { known: 1, unknown: 1 },
      teamId: { known: 1, unknown: 1 }
    });
  });

  it("records the last included event as a reproducible export watermark", () => {
    const watermark = buildConversationReportEventWatermark(rows, new Date("2026-07-11T07:00:00.000Z"));

    assert.deepEqual(watermark, {
      id: "evt-status.changed-2026-07-11T06:50:00.000Z",
      ingestedAt: "2026-07-11T06:50:00.000Z",
      occurredAt: "2026-07-11T06:50:00.000Z"
    });
  });
});

function conversation(
  id: string,
  channel: string,
  operatorId: string,
  status: string,
  topic: string,
  lifecycleEvents: NonNullable<ConversationReportSourceRow["lifecycleEvents"]>
): ConversationReportSourceRow {
  return { channel, createdAt: "", id, lifecycleEvents, messages: [], operatorId, slaTone: "", status, topic, updatedAt: "" };
}

function event(
  eventType: string,
  occurredAt: string,
  data: Record<string, unknown> = {},
  source = "runtime",
  ingestedAt = occurredAt
): NonNullable<ConversationReportSourceRow["lifecycleEvents"]>[number] {
  return { data, eventType, id: `evt-${eventType}-${occurredAt}`, ingestedAt, occurredAt, source };
}
