import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSupportOperationsWorkspace,
  SUPPORT_OPERATIONS_WORKSPACE_VERSION,
  type SupportOperationsConversationRow,
  type SupportOperationsMessage
} from "../apps/api-gateway/src/reports/support-operations-workspace.ts";

const NOW = "2026-08-18T12:00:00.000Z";

describe("support operations workspace v2 contracts", () => {
  it("returns an honest numeric and versioned contract for an empty source", () => {
    const workspace = buildSupportOperationsWorkspace([], { now: NOW, period: "today" });

    assert.equal(workspace.version, SUPPORT_OPERATIONS_WORKSPACE_VERSION);
    assert.deepEqual(workspace.period.current, {
      from: "2026-08-18T00:00:00.000Z",
      to: NOW
    });
    assert.deepEqual(workspace.period.previous, {
      from: "2026-08-17T00:00:00.000Z",
      to: "2026-08-17T12:00:00.000Z"
    });
    assert.equal(workspace.period.isCurrentWindowPartial, true);
    assert.equal(workspace.metrics.current.incoming, 0);
    assert.equal(workspace.metrics.current.resolved, 0);
    assert.equal(workspace.metrics.current.backlog, 0);
    assert.equal(workspace.metrics.current.waiting, 0);
    assert.equal(workspace.metrics.current.firstResponseAverageSeconds, null);
    assert.equal(workspace.metrics.current.firstResponseCoveragePercent, null);
    assert.equal(workspace.metrics.current.slaAttainmentPercent, null);
    assert.equal(workspace.metrics.current.reopenRatePercent, null);
    assert.equal(workspace.metrics.current.csatAverage, null);
    assert.equal(workspace.metrics.current.csatCoveragePercent, null);
    assert.equal(workspace.comparisons.firstResponseAverageSeconds.comparable, false);
    assert.equal(workspace.comparisons.incoming.comparable, true);
    assert.equal(workspace.comparisons.incoming.percent, null);
    assert.equal(workspace.timeSeries.granularity, "hour");
    assert.equal(workspace.timeSeries.current.length, 12);
    assert.equal(workspace.timeSeries.current.every((point) => point.incoming === 0 && point.firstResponseMedianSeconds === null), true);
    assert.deepEqual(workspace.breakdowns, { channels: [], operators: [], topics: [] });
    assert.deepEqual(workspace.insights, []);
    assert.equal(workspace.backlogAge.length, 6);
    assert.equal(workspace.backlogAge.every((bucket) => bucket.count === 0 && bucket.sharePercent === null), true);
    assert.equal(JSON.stringify(workspace).includes("NaN"), false);
    assert.equal(JSON.stringify(workspace).includes("undefined"), false);

    const metricKeys = Object.keys(workspace.metrics.current).sort();
    assert.deepEqual(workspace.metricDefinitions.map((definition) => definition.key).sort(), metricKeys);
    assert.equal(workspace.metricDefinitions.every((definition) => definition.formula.length > 0 && definition.source.length > 0), true);

    const definitionText = workspace.metricDefinitions.flatMap((definition) => [definition.formula, ...definition.source, ...definition.caveats]);
    assert.equal(definitionText.every((text) => /[А-Яа-яЁё]/.test(text) && !/[a-z]/.test(text)), true);
    assert.deepEqual(workspace.metricDefinitions.find((definition) => definition.key === "incoming"), {
      key: "incoming",
      unit: "count",
      formula: "Уникальные обращения с известным временем создания, попавшим в выбранный период.",
      source: ["Время создания обращения", "Событие создания обращения"],
      caveats: ["Строки без корректного времени создания исключаются."]
    });
  });

  it("calculates the full support KPI set and excludes bot, event and internal messages from human responses", () => {
    const rows = comprehensiveRows();
    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });
    const current = workspace.metrics.current;

    assert.equal(current.incoming, 2);
    assert.equal(current.resolved, 2);
    assert.equal(current.backlog, 0);
    assert.equal(current.waiting, 0);
    assert.equal(current.slaRecordedSamples, 2);
    assert.equal(current.slaBreaches, 1);
    assert.equal(current.slaAttainmentPercent, 50);
    assert.equal(current.firstResponseSamples, 2);
    assert.equal(current.firstResponseAverageSeconds, 45);
    assert.equal(current.firstResponseMedianSeconds, 45);
    assert.equal(current.firstResponseP90Seconds, 57);
    assert.equal(current.firstResponseCoveragePercent, 100);
    assert.equal(current.nextResponseSamples, 1);
    assert.equal(current.nextResponseMedianSeconds, 120);
    assert.equal(current.nextResponseP90Seconds, 120);
    assert.equal(current.firstResolutionSamples, 2);
    assert.equal(current.firstResolutionMedianSeconds, 3_600);
    assert.equal(current.firstResolutionP90Seconds, 3_600);
    assert.equal(current.fullResolutionSamples, 2);
    assert.equal(current.fullResolutionMedianSeconds, 7_200);
    assert.equal(current.fullResolutionP90Seconds, 10_080);
    assert.equal(current.reopenedConversations, 1);
    assert.equal(current.reopenRatePercent, 50);
    assert.equal(current.oneTouchResolutionCount, 1);
    assert.equal(current.oneTouchResolutionSamples, 2);
    assert.equal(current.oneTouchResolutionPercent, 50);
    assert.equal(current.csatAverage, 4);
    assert.equal(current.csatScaleMaximum, 5);
    assert.equal(current.csatPositiveRatePercent, 50);
    assert.equal(current.csatSamples, 2);
    assert.equal(current.csatCoveragePercent, 100);
    assert.equal(current.internalComments, 1);
    assert.equal(current.agentTouches, 3);

    assert.equal(workspace.metrics.previous.incoming, 1);
    assert.equal(workspace.metrics.previous.resolved, 1);
    assert.equal(workspace.metrics.previous.firstResponseAverageSeconds, 120);
    assert.equal(workspace.breakdowns.channels[0]?.key, "sdk");
    assert.equal(workspace.breakdowns.channels[0]?.incoming, 2);
    assert.deepEqual(workspace.breakdowns.operators.map((operator) => [operator.key, operator.agentTouches]), [
      ["operator-1", 2],
      ["operator-2", 1]
    ]);
    assert.equal(workspace.insights.some((insight) => insight.code === "sla_breaches" && insight.severity === "critical"), true);
    assert.equal(workspace.timeSeries.current.reduce((sum, point) => sum + point.incoming, 0), 2);
    assert.equal(workspace.timeSeries.current.reduce((sum, point) => sum + point.agentTouches, 0), 3);
  });

  it("uses interpolated median and p90 values without allowing an outlier to corrupt sample counts", () => {
    const responseSeconds = [10, 20, 30, 1_000];
    const rows = responseSeconds.map((seconds, index) => sourceRow(`outlier-${index}`, `2026-08-18T0${index + 1}:00:00.000Z`, {
      messages: responseMessages(`2026-08-18T0${index + 1}:00:00.000Z`, seconds)
    }));

    const metrics = buildSupportOperationsWorkspace(rows, { now: NOW }).metrics.current;

    assert.equal(metrics.incoming, 4);
    assert.equal(metrics.firstResponseSamples, 4);
    assert.equal(metrics.firstResponseCoveragePercent, 100);
    assert.equal(metrics.firstResponseAverageSeconds, 265);
    assert.equal(metrics.firstResponseMedianSeconds, 25);
    assert.equal(metrics.firstResponseP90Seconds, 709);
  });

  it("keeps missing evidence distinct from zero performance and exposes unanswered client work", () => {
    const row = sourceRow("unanswered", "2026-08-18T08:00:00.000Z", {
      messages: [
        message("client", "2026-08-18T08:00:00.000Z", "client"),
        message("bot", "2026-08-18T08:00:10.000Z", "agent", { isBot: true }),
        message("bot-note", "2026-08-18T08:00:20.000Z", "agent", { isBot: true, type: "internal" })
      ],
      slaTone: "warning"
    });

    const workspace = buildSupportOperationsWorkspace([row], { now: NOW });
    const metrics = workspace.metrics.current;

    assert.equal(metrics.incoming, 1);
    assert.equal(metrics.backlog, 1);
    assert.equal(metrics.waiting, 1);
    assert.equal(metrics.firstResponseSamples, 0);
    assert.equal(metrics.firstResponseCoveragePercent, 0);
    assert.equal(metrics.firstResponseAverageSeconds, null);
    assert.equal(metrics.firstResponseMedianSeconds, null);
    assert.equal(metrics.slaRecordedSamples, 0);
    assert.equal(metrics.slaAttainmentPercent, null);
    assert.equal(metrics.slaBreaches, 0);
    assert.equal(metrics.agentTouches, 0);
    assert.equal(metrics.internalComments, 0);
    assert.equal(metrics.csatSamples, 0);
    assert.equal(metrics.csatAverage, null);
    assert.equal(workspace.insights.some((insight) => insight.code === "first_response_low_coverage"), true);
  });

  it("derives human response, internal comments, closure and SLA from lifecycle-only rows", () => {
    const row = sourceRow("lifecycle-only", "2020-01-01T00:00:00.000Z", {
      lifecycleEvents: [
        event("conversation.created", "2026-08-18T08:00:00.000Z"),
        event("message.received", "2026-08-18T08:00:00.000Z"),
        event("message.sent", "2026-08-18T08:00:10.000Z", {}, "bot"),
        event("message.internal", "2026-08-18T08:00:20.000Z", { operatorId: "operator-1" }),
        event("message.sent", "2026-08-18T08:01:00.000Z", { operatorId: "operator-1" }),
        event("sla.met", "2026-08-18T08:01:00.000Z"),
        event("status.changed", "2026-08-18T09:00:00.000Z", { toStatus: "resolved" })
      ],
      messages: [],
      operatorId: "operator-1",
      operatorName: "Alex",
      slaTone: "unknown",
      status: "active"
    });

    const metrics = buildSupportOperationsWorkspace([row], { now: NOW }).metrics.current;

    assert.equal(metrics.incoming, 1);
    assert.equal(metrics.resolved, 1);
    assert.equal(metrics.firstResponseAverageSeconds, 60);
    assert.equal(metrics.agentTouches, 1);
    assert.equal(metrics.internalComments, 1);
    assert.equal(metrics.slaRecordedSamples, 1);
    assert.equal(metrics.slaAttainmentPercent, 100);
    assert.equal(metrics.slaBreaches, 0);
  });

  it("builds backlog age buckets and channel, topic and operator workload breakdowns from current state", () => {
    const starts = [
      "2026-08-18T11:00:00.000Z",
      "2026-08-18T07:00:00.000Z",
      "2026-08-16T12:00:00.000Z",
      "2026-08-13T12:00:00.000Z",
      "2026-08-08T12:00:00.000Z",
      "2026-07-09T12:00:00.000Z"
    ];
    const rows = starts.map((createdAt, index) => sourceRow(`age-${index}`, createdAt, {
      channel: index < 4 ? "SDK" : "Telegram",
      messages: index === 0
        ? [message(`client-${index}`, createdAt, "client"), message("reply", "2026-08-18T11:10:00.000Z", "agent", { operatorId: "operator-1" })]
        : [message(`client-${index}`, createdAt, "client")],
      operatorId: index < 5 ? "operator-1" : "operator-2",
      operatorName: index < 5 ? "Alex" : "Berta",
      topic: index % 2 === 0 ? "Payment" : "Delivery"
    }));

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "30days" });

    assert.equal(workspace.metrics.current.backlog, 6);
    assert.equal(workspace.metrics.current.waiting, 5);
    assert.deepEqual(workspace.backlogAge.map((bucket) => bucket.count), [1, 1, 1, 1, 1, 1]);
    assert.equal(workspace.backlogAge.every((bucket) => bucket.sharePercent === 16.7), true);
    assert.deepEqual(workspace.breakdowns.channels.map((item) => [item.key, item.backlog]), [["sdk", 4], ["telegram", 2]]);
    assert.deepEqual(workspace.breakdowns.topics.map((item) => [item.key, item.backlog]), [["payment", 3], ["delivery", 3]]);
    assert.deepEqual(workspace.breakdowns.operators.map((item) => [item.key, item.assignedBacklog]), [["operator-1", 5], ["operator-2", 1]]);
    const latestDay = workspace.timeSeries.kpi.byGrain.day.current.at(-1)!;
    assert.deepEqual(latestDay.metrics.backlog, { samples: 6, value: 6 });
    assert.deepEqual(latestDay.metrics.waiting, { samples: 5, value: 5 });
  });

  it("canonicalizes a unique legacy name without duplicate workload and conserves operator totals", () => {
    const rows = [
      sourceRow("canonical-closed", "2026-08-18T08:00:00.000Z", {
        lifecycleEvents: [event("status.changed", "2026-08-18T09:00:00.000Z", { toStatus: "closed" })],
        messages: [
          message("closed-client", "2026-08-18T08:00:00.000Z", "client"),
          message("closed-agent", "2026-08-18T08:01:00.000Z", "agent", { author: "Alex" }),
          message("closed-note", "2026-08-18T08:02:00.000Z", "agent", { author: "Alex", type: "internal" })
        ],
        operatorId: "operator-1",
        operatorName: "Alex",
        status: "closed",
        updatedAt: "2026-08-18T09:00:00.000Z"
      }),
      sourceRow("canonical-backlog", "2026-08-18T10:00:00.000Z", {
        messages: [
          message("backlog-client", "2026-08-18T10:00:00.000Z", "client"),
          message("backlog-agent", "2026-08-18T10:01:00.000Z", "agent", { author: "Alex" })
        ],
        operatorId: "operator-1",
        operatorName: "Alex"
      }),
      sourceRow("canonical-name-only-owner", "2026-08-18T11:00:00.000Z", {
        messages: [],
        operatorName: "Alex"
      })
    ];

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });
    const [operator] = workspace.breakdowns.operators;

    assert.deepEqual(workspace.breakdowns.operators.map((item) => item.key), ["operator-1"]);
    assert.deepEqual(operator, {
      agentTouches: 2,
      assignedBacklog: 2,
      firstResponseMedianSeconds: 60,
      identityStatus: "resolved",
      internalComments: 1,
      key: "operator-1",
      label: "Alex",
      operatorId: "operator-1",
      resolved: 1,
      workloadSharePercent: 100
    });
    assertOperatorConservation(workspace);
    assert.equal(workspace.breakdowns.operators.some((item) => item.key.startsWith("name:")), false);
  });

  it("joins direct messages to lifecycle actors and excludes every non-operator principal from human KPIs", () => {
    const actorTypes = ["system", "worker", "service_admin", "client"] as const;
    const rows = actorTypes.map((actorType, index) => {
      const minute = String(index * 10).padStart(2, "0");
      const responseMinute = String(index * 10 + 1).padStart(2, "0");
      const messageId = `non-human-${actorType}`;
      return sourceRow(`actor-${actorType}`, `2026-08-18T08:${minute}:00.000Z`, {
        lifecycleEvents: [actorEvent("message.sent", `2026-08-18T08:${responseMinute}:00.000Z`, { messageId }, {
          actorId: `${actorType}-1`,
          actorName: actorType === "system" ? "Operator" : actorType,
          actorType
        })],
        messages: [
          message(`client-${actorType}`, `2026-08-18T08:${minute}:00.000Z`, "client"),
          message(messageId, `2026-08-18T08:${responseMinute}:00.000Z`, "agent", {
            author: actorType === "system" ? "Operator" : actorType
          })
        ],
        operatorId: "operator-1",
        operatorName: "Alex"
      });
    });
    rows.push(sourceRow("system-internal", "2026-08-18T09:00:00.000Z", {
      lifecycleEvents: [actorEvent("internal_comment.created", "2026-08-18T09:01:00.000Z", { messageId: "system-note" }, {
        actorType: "system"
      })],
      messages: [
        message("system-note-client", "2026-08-18T09:00:00.000Z", "client"),
        message("system-note", "2026-08-18T09:01:00.000Z", "agent", { author: "Operator", type: "internal" })
      ],
      operatorId: "operator-1",
      operatorName: "Alex"
    }));
    rows.push(sourceRow("direct-system-fallback", "2026-08-18T09:10:00.000Z", {
      messages: [
        message("direct-system-client", "2026-08-18T09:10:00.000Z", "client"),
        message("direct-system-agent", "2026-08-18T09:11:00.000Z", "agent", { author: "Система" })
      ],
      operatorId: "operator-1",
      operatorName: "Alex"
    }));

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });

    assert.equal(workspace.metrics.current.agentTouches, 0);
    assert.equal(workspace.metrics.current.internalComments, 0);
    assert.equal(workspace.metrics.current.firstResponseSamples, 0);
    assert.equal(workspace.metrics.current.waiting, rows.length);
    assert.deepEqual(workspace.breakdowns.operators.map((item) => [item.key, item.agentTouches]), [["operator-1", 0]]);
    assert.equal(workspace.breakdowns.operators.some((item) => /operator|оператор|система|system/i.test(item.label)), false);
  });

  it("keeps legacy Operator and Оператор activity in one stable unattributed row without exposing the placeholder", () => {
    const rows = [
      ["legacy-operator-en", "Operator", "08:00:00", "08:01:00"],
      ["legacy-operator-ru", "Оператор", "09:00:00", "09:01:00"]
    ].map(([id, author, clientTime, agentTime]) => sourceRow(id!, `2026-08-18T${clientTime}.000Z`, {
      messages: [
        message(`${id}-client`, `2026-08-18T${clientTime}.000Z`, "client"),
        message(`${id}-agent`, `2026-08-18T${agentTime}.000Z`, "agent", { author })
      ]
    }));

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });

    assert.deepEqual(workspace.breakdowns.operators, [{
      agentTouches: 2,
      assignedBacklog: 2,
      firstResponseMedianSeconds: 60,
      identityStatus: "unattributed",
      internalComments: 0,
      key: "unattributed",
      label: "Неатрибутированные",
      operatorId: null,
      resolved: 0,
      workloadSharePercent: 100
    }]);
    assert.equal(JSON.stringify(workspace.breakdowns.operators).includes("Operator"), false);
    assert.equal(JSON.stringify(workspace.breakdowns.operators).includes("Оператор"), false);
    assertOperatorConservation(workspace);
  });

  it("keeps an ambiguous shared name unattributed while preserving each canonical owner", () => {
    const rows = [
      sourceRow("same-name-one", "2026-08-18T08:00:00.000Z", {
        operatorId: "operator-1",
        operatorName: "Alex"
      }),
      sourceRow("same-name-two", "2026-08-18T08:30:00.000Z", {
        lifecycleEvents: [event("status.changed", "2026-08-18T09:30:00.000Z", { toStatus: "closed" })],
        operatorId: "operator-2",
        operatorName: "Alex",
        status: "closed",
        updatedAt: "2026-08-18T09:30:00.000Z"
      }),
      sourceRow("same-name-legacy", "2026-08-18T10:00:00.000Z", {
        messages: [
          message("same-name-client", "2026-08-18T10:00:00.000Z", "client"),
          message("same-name-agent", "2026-08-18T10:01:00.000Z", "agent", { author: "Alex" })
        ],
        operatorName: "Alex"
      }),
      sourceRow("same-name-empty-backlog", "2026-08-18T10:30:00.000Z", {
        messages: [],
        operatorName: "Alex"
      }),
      sourceRow("same-name-empty-closed", "2026-08-18T10:45:00.000Z", {
        lifecycleEvents: [event("status.changed", "2026-08-18T11:30:00.000Z", { toStatus: "closed" })],
        messages: [],
        operatorName: "Alex",
        status: "closed",
        updatedAt: "2026-08-18T11:30:00.000Z"
      })
    ];

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });
    const byKey = new Map(workspace.breakdowns.operators.map((item) => [item.key, item]));

    assert.equal(byKey.get("operator-1")?.assignedBacklog, 1);
    assert.equal(byKey.get("operator-2")?.resolved, 1);
    assert.equal(byKey.get("unattributed")?.assignedBacklog, 2);
    assert.equal(byKey.get("unattributed")?.resolved, 1);
    assert.equal(byKey.get("unattributed")?.agentTouches, 1);
    assert.equal(byKey.get("unattributed")?.firstResponseMedianSeconds, 60);
    assert.equal(byKey.get("operator-1")?.agentTouches, 0);
    assert.equal(byKey.get("operator-2")?.agentTouches, 0);
    assertOperatorConservation(workspace);
  });

  it("attributes a lifecycle-backed response actor instead of the conversation current owner", () => {
    const rows = [
      sourceRow("alex-identity", "2026-08-18T08:00:00.000Z", {
        operatorId: "operator-alex",
        operatorName: "Alex"
      }),
      sourceRow("reassigned-to-berta", "2026-08-18T09:00:00.000Z", {
        lifecycleEvents: [actorEvent("message.sent", "2026-08-18T09:01:00.000Z", { messageId: "reassigned-agent" }, {
          actorId: "operator-alex",
          actorName: "operator-alex",
          actorType: "operator"
        })],
        messages: [
          message("reassigned-client", "2026-08-18T09:00:00.000Z", "client"),
          message("reassigned-agent", "2026-08-18T09:01:00.000Z", "agent", { author: "Alex" })
        ],
        operatorId: "operator-berta",
        operatorName: "Berta"
      })
    ];

    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW, period: "today" });
    const byKey = new Map(workspace.breakdowns.operators.map((item) => [item.key, item]));

    assert.equal(byKey.get("operator-alex")?.agentTouches, 1);
    assert.equal(byKey.get("operator-alex")?.firstResponseMedianSeconds, 60);
    assert.equal(byKey.get("operator-berta")?.agentTouches, 0);
    assert.equal(byKey.get("operator-berta")?.firstResponseMedianSeconds, null);
    assert.equal(byKey.get("operator-berta")?.assignedBacklog, 1);
    assertOperatorConservation(workspace);
  });

  it("uses tenant-local date boundaries and daily buckets for short custom ranges", () => {
    const rows = [
      sourceRow("current-edge", "2026-06-30T21:00:00.000Z"),
      sourceRow("previous-edge", "2026-06-30T20:59:59.999Z"),
      sourceRow("current-end", "2026-07-02T20:59:59.999Z"),
      sourceRow("excluded-end", "2026-07-02T21:00:00.000Z")
    ];
    const workspace = buildSupportOperationsWorkspace(rows, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-02",
      now: NOW,
      period: "custom",
      timezoneOffsetMinutes: 180
    });

    assert.deepEqual(workspace.period.current, {
      from: "2026-06-30T21:00:00.000Z",
      to: "2026-07-02T21:00:00.000Z"
    });
    assert.deepEqual(workspace.period.previous, {
      from: "2026-06-28T21:00:00.000Z",
      to: "2026-06-30T21:00:00.000Z"
    });
    assert.equal(workspace.period.isCurrentWindowPartial, false);
    assert.equal(workspace.metrics.current.incoming, 2);
    assert.equal(workspace.metrics.previous.incoming, 1);
    assert.equal(workspace.timeSeries.granularity, "day");
    assert.equal(workspace.timeSeries.aggregated, false);
    assert.equal(workspace.timeSeries.current.length, 2);
    assert.deepEqual(workspace.timeSeries.current.map((point) => point.incoming), [1, 1]);
  });

  it("aggregates long custom ranges into explicitly labelled weekly points", () => {
    const workspace = buildSupportOperationsWorkspace([], {
      dateFrom: "2026-04-01",
      dateTo: "2026-08-10",
      now: NOW,
      period: "Свой период",
      timezoneOffsetMinutes: 180
    });

    assert.equal(workspace.timeSeries.granularity, "week");
    assert.equal(workspace.timeSeries.aggregated, true);
    assert.equal(workspace.timeSeries.aggregationReason, "custom_range_exceeds_93_days");
    assert.equal(workspace.timeSeries.current.length, 19);
    assert.equal(workspace.timeSeries.current.at(-1)?.to, workspace.period.current.to);
  });

  it("exposes day, ISO-week and calendar-month KPI buckets on tenant-local boundaries", () => {
    const workspace = buildSupportOperationsWorkspace([], {
      dateFrom: "2026-07-30",
      dateTo: "2026-08-05",
      now: NOW,
      period: "custom",
      timezoneOffsetMinutes: 180
    });
    const kpi = workspace.timeSeries.kpi;

    assert.deepEqual(kpi.availableGrains, ["day", "week", "month"]);
    assert.equal(kpi.byGrain.day.current.length, 7);
    assert.deepEqual([kpi.byGrain.day.current[0]!.from, kpi.byGrain.day.current[0]!.to], [
      "2026-07-29T21:00:00.000Z",
      "2026-07-30T21:00:00.000Z"
    ]);
    assert.deepEqual(kpi.byGrain.week.current.map(({ from, to }) => [from, to]), [
      ["2026-07-29T21:00:00.000Z", "2026-08-02T21:00:00.000Z"],
      ["2026-08-02T21:00:00.000Z", "2026-08-05T21:00:00.000Z"]
    ]);
    assert.deepEqual(kpi.byGrain.month.current.map(({ from, to }) => [from, to]), [
      ["2026-07-29T21:00:00.000Z", "2026-07-31T21:00:00.000Z"],
      ["2026-07-31T21:00:00.000Z", "2026-08-05T21:00:00.000Z"]
    ]);
    assert.deepEqual(kpi.byGrain.week.previous.map(({ from, to }) => [from, to]), [
      ["2026-07-22T21:00:00.000Z", "2026-07-26T21:00:00.000Z"],
      ["2026-07-26T21:00:00.000Z", "2026-07-29T21:00:00.000Z"]
    ]);
  });

  it("recomputes KPI bucket percentiles, scores and rates from raw evidence with honest samples", () => {
    const responseSeconds = [10, 100, 300, null] as const;
    const resolutionSeconds = [600, 1_200, 2_400, 4_800] as const;
    const starts = [
      "2026-07-27T06:00:00.000Z",
      "2026-07-28T06:00:00.000Z",
      "2026-07-28T07:00:00.000Z",
      "2026-07-28T08:00:00.000Z"
    ];
    const rows = starts.map((startedAt, index): SupportOperationsConversationRow => {
      const closedAt = new Date(Date.parse(startedAt) + resolutionSeconds[index]! * 1_000).toISOString();
      const lifecycleEvents = [
        event(index === 2 ? "sla.overdue" : "sla.met", new Date(Date.parse(startedAt) + 5_000).toISOString()),
        event("status.changed", closedAt, { toStatus: "resolved" }),
        ...(index === 2
          ? [event("status.changed", new Date(Date.parse(closedAt) + 60_000).toISOString(), { fromStatus: "resolved", toStatus: "active" })]
          : [])
      ];
      return sourceRow(`raw-${index}`, startedAt, {
        lifecycleEvents: index === 3 ? lifecycleEvents.slice(1) : lifecycleEvents,
        messages: responseSeconds[index] === null ? [message("client", startedAt, "client")] : responseMessages(startedAt, responseSeconds[index]!),
        ...(index < 3
          ? { rating: { createdAt: new Date(Date.parse(closedAt) + 10_000).toISOString(), scale: "1-5", score: index === 0 ? 1 : 5 } }
          : {}),
        slaTone: index === 3 ? "unknown" : "ok",
        status: index === 2 ? "active" : "resolved",
        updatedAt: closedAt
      });
    });
    const workspace = buildSupportOperationsWorkspace(rows, {
      dateFrom: "2026-07-27",
      dateTo: "2026-08-02",
      now: NOW,
      period: "custom",
      timezoneOffsetMinutes: 180
    });
    const days = workspace.timeSeries.kpi.byGrain.day.current;
    const week = workspace.timeSeries.kpi.byGrain.week.current[0]!;

    assert.equal(days[0]!.metrics.firstResponseP50Seconds.value, 10);
    assert.equal(days[1]!.metrics.firstResponseP50Seconds.value, 200);
    assert.deepEqual(week.metrics.firstResponseP50Seconds, { samples: 3, value: 100 });
    assert.deepEqual(week.metrics.firstResponseP90Seconds, { samples: 3, value: 260 });
    assert.deepEqual(week.metrics.firstResolutionP50Seconds, { samples: 4, value: 1_800 });
    assert.deepEqual(week.metrics.firstResolutionP90Seconds, { samples: 4, value: 4_080 });
    assert.deepEqual(week.metrics.firstResponseCoveragePercent, { samples: 4, value: 75 });
    assert.deepEqual(week.metrics.responseCoveragePercent, { samples: 4, value: 75 });
    assert.deepEqual(week.metrics.csatAverage, { samples: 3, scaleMaximum: 5, value: 3.7 });
    assert.deepEqual(week.metrics.csatCoveragePercent, { samples: 4, value: 75 });
    assert.deepEqual(week.metrics.csatPositiveRatePercent, { samples: 3, value: 66.7 });
    assert.deepEqual(week.metrics.slaAttainmentPercent, { samples: 3, value: 66.7 });
    assert.deepEqual(week.metrics.reopenRatePercent, { samples: 4, value: 25 });
    assert.deepEqual(week.metrics.oneTouchResolutionPercent, { samples: 4, value: 50 });
    assert.deepEqual(week.metrics.incoming, { samples: 4, value: 4 });
    assert.deepEqual(week.metrics.resolved, { samples: 4, value: 4 });

    const emptyWeek = workspace.timeSeries.kpi.byGrain.week.previous[0]!;
    assert.deepEqual(emptyWeek.metrics.firstResponseP50Seconds, { samples: 0, value: null });
    assert.deepEqual(emptyWeek.metrics.csatAverage, { samples: 0, scaleMaximum: null, value: null });
    assert.deepEqual(emptyWeek.metrics.firstResponseCoveragePercent, { samples: 0, value: null });
    assert.deepEqual(emptyWeek.metrics.incoming, { samples: 0, value: 0 });
  });

  it("attributes first-resolution duration only to the bucket containing the first close", () => {
    const row = sourceRow("reclose", "2026-07-27T06:00:00.000Z", {
      lifecycleEvents: [
        event("status.changed", "2026-07-27T07:00:00.000Z", { toStatus: "resolved" }),
        event("status.changed", "2026-07-27T08:00:00.000Z", { fromStatus: "resolved", toStatus: "active" }),
        event("status.changed", "2026-07-28T07:00:00.000Z", { toStatus: "resolved" })
      ],
      status: "resolved",
      updatedAt: "2026-07-28T07:00:00.000Z"
    });
    const days = buildSupportOperationsWorkspace([row], {
      dateFrom: "2026-07-27",
      dateTo: "2026-07-28",
      now: NOW,
      period: "custom",
      timezoneOffsetMinutes: 180
    }).timeSeries.kpi.byGrain.day.current;

    assert.deepEqual(days[0]!.metrics.firstResolutionP50Seconds, { samples: 1, value: 3_600 });
    assert.deepEqual(days[1]!.metrics.firstResolutionP50Seconds, { samples: 0, value: null });
    assert.equal(days[1]!.metrics.resolved.value, 1);
  });

  it("rejects invalid periods, timezones, impossible dates, future starts and excessive custom ranges", () => {
    assert.throws(() => buildSupportOperationsWorkspace([], { now: NOW, period: "quarter" as "today" }), /Unsupported/);
    assert.throws(() => buildSupportOperationsWorkspace([], { now: NOW, timezoneOffsetMinutes: 841 }), /timezoneOffsetMinutes/);
    assert.throws(() => buildSupportOperationsWorkspace([], {
      dateFrom: "2026-02-30", dateTo: "2026-03-01", now: NOW, period: "custom"
    }), /invalid/);
    assert.throws(() => buildSupportOperationsWorkspace([], {
      dateFrom: "2026-08-19", dateTo: "2026-08-20", now: NOW, period: "custom"
    }), /future/);
    assert.throws(() => buildSupportOperationsWorkspace([], {
      dateFrom: "2025-01-01", dateTo: "2026-08-01", now: NOW, period: "custom"
    }), /cannot exceed/);
  });

  it("reports invalid and mixed-scale CSAT evidence without manufacturing an average", () => {
    const rows = [
      resolvedWithRating("five", 5, "1-5"),
      resolvedWithRating("ten", 10, "0-10"),
      resolvedWithRating("unknown", 3, "custom"),
      resolvedWithRating("invalid", 7, "1-5")
    ];
    const workspace = buildSupportOperationsWorkspace(rows, { now: NOW });
    const metrics = workspace.metrics.current;

    assert.equal(metrics.resolved, 4);
    assert.equal(metrics.csatSamples, 3);
    assert.equal(metrics.csatCoveragePercent, 75);
    assert.equal(metrics.csatAverage, null);
    assert.equal(metrics.csatScaleMaximum, null);
    assert.equal(metrics.csatPositiveRatePercent, 100);
    assert.equal(workspace.source.invalidRatings, 1);
    assert.deepEqual(workspace.timeSeries.kpi.byGrain.day.current[0]!.metrics.csatAverage, {
      samples: 3,
      scaleMaximum: null,
      value: null
    });
    assert.deepEqual(workspace.timeSeries.kpi.byGrain.day.current[0]!.metrics.csatPositiveRatePercent, {
      samples: 2,
      value: 100
    });
  });

  it("selects the latest valid CSAT rating independently at each comparison cutoff", () => {
    const row = sourceRow("rerated", "2026-08-17T08:00:00.000Z", {
      lifecycleEvents: [
        event("status.changed", "2026-08-17T09:00:00.000Z", { toStatus: "closed" }),
        event("status.changed", "2026-08-18T08:00:00.000Z", { fromStatus: "closed", toStatus: "active" }),
        event("status.changed", "2026-08-18T09:00:00.000Z", { fromStatus: "active", toStatus: "closed" })
      ],
      ratings: [
        { createdAt: "2026-08-17T09:05:00.000Z", scale: "1-5", score: 2 },
        { createdAt: "2026-08-18T10:00:00.000Z", scale: "1-5", score: 5 },
        { createdAt: "2026-08-18T11:00:00.000Z", scale: "1-5", score: 7 }
      ],
      status: "closed",
      updatedAt: "2026-08-18T09:00:00.000Z"
    });

    const workspace = buildSupportOperationsWorkspace([row], { now: NOW, period: "today" });

    assert.equal(workspace.metrics.previous.resolved, 1);
    assert.equal(workspace.metrics.previous.csatSamples, 1);
    assert.equal(workspace.metrics.previous.csatAverage, 2);
    assert.equal(workspace.metrics.previous.csatPositiveRatePercent, 0);
    assert.equal(workspace.metrics.current.resolved, 1);
    assert.equal(workspace.metrics.current.csatSamples, 1);
    assert.equal(workspace.metrics.current.csatAverage, 5);
    assert.equal(workspace.metrics.current.csatPositiveRatePercent, 100);
    assert.equal(workspace.source.invalidRatings, 1);
  });

  it("emits deterministic insight ordering and stable breakdown ordering independent of source row order", () => {
    const rows = comprehensiveRows();
    const forward = buildSupportOperationsWorkspace(rows, { now: NOW });
    const reverse = buildSupportOperationsWorkspace([...rows].reverse(), { now: NOW });

    assert.deepEqual(reverse.insights, forward.insights);
    assert.deepEqual(reverse.breakdowns.channels, forward.breakdowns.channels);
    assert.deepEqual(reverse.breakdowns.topics, forward.breakdowns.topics);
    assert.deepEqual(reverse.breakdowns.operators, forward.breakdowns.operators);
  });
});

function comprehensiveRows(): SupportOperationsConversationRow[] {
  return [
    sourceRow("reopened", "2026-08-18T08:00:00.000Z", {
      lifecycleEvents: [
        event("conversation.created", "2026-08-18T08:00:00.000Z"),
        event("sla.met", "2026-08-18T08:01:00.000Z"),
        event("status.changed", "2026-08-18T09:00:00.000Z", { toStatus: "resolved" }),
        event("status.changed", "2026-08-18T10:00:00.000Z", { fromStatus: "resolved", toStatus: "active" }),
        event("status.changed", "2026-08-18T11:00:00.000Z", { toStatus: "closed" })
      ],
      messages: [
        message("client-1", "2026-08-18T08:00:00.000Z", "client"),
        message("bot", "2026-08-18T08:00:10.000Z", "agent", { isBot: true }),
        message("internal", "2026-08-18T08:00:20.000Z", "agent", { operatorId: "operator-1", type: "internal" }),
        message("agent-1", "2026-08-18T08:01:00.000Z", "agent", { operatorId: "operator-1" }),
        message("client-2", "2026-08-18T08:10:00.000Z", "client"),
        message("client-3", "2026-08-18T08:10:10.000Z", "client"),
        message("agent-2", "2026-08-18T08:12:00.000Z", "agent", { operatorId: "operator-1" })
      ],
      operatorId: "operator-1",
      operatorName: "Alex",
      qualityAssessment: { createdAt: "2026-08-18T11:05:00.000Z", scale: "1-5", score: 5 },
      status: "closed",
      updatedAt: "2026-08-18T11:00:00.000Z"
    }),
    sourceRow("one-touch", "2026-08-18T08:30:00.000Z", {
      lifecycleEvents: [
        event("conversation.created", "2026-08-18T08:30:00.000Z"),
        event("sla.overdue", "2026-08-18T08:31:00.000Z"),
        event("status.changed", "2026-08-18T09:30:00.000Z", { toStatus: "resolved" })
      ],
      messages: responseMessages("2026-08-18T08:30:00.000Z", 30, "operator-2"),
      operatorId: "operator-2",
      operatorName: "Berta",
      rating: { createdAt: "2026-08-18T09:35:00.000Z", scale: "1-5", score: 3 },
      slaTone: "critical",
      status: "resolved",
      updatedAt: "2026-08-18T09:30:00.000Z"
    }),
    sourceRow("previous", "2026-08-17T08:00:00.000Z", {
      lifecycleEvents: [
        event("conversation.created", "2026-08-17T08:00:00.000Z"),
        event("sla.met", "2026-08-17T08:02:00.000Z"),
        event("status.changed", "2026-08-17T09:00:00.000Z", { toStatus: "resolved" })
      ],
      messages: responseMessages("2026-08-17T08:00:00.000Z", 120, "operator-1"),
      operatorId: "operator-1",
      operatorName: "Alex",
      status: "resolved",
      updatedAt: "2026-08-17T09:00:00.000Z"
    })
  ];
}

function resolvedWithRating(id: string, score: number, scale: string): SupportOperationsConversationRow {
  return sourceRow(id, "2026-08-18T08:00:00.000Z", {
    lifecycleEvents: [event("status.changed", "2026-08-18T09:00:00.000Z", { toStatus: "resolved" })],
    qualityAssessment: { createdAt: "2026-08-18T09:05:00.000Z", scale, score },
    status: "resolved",
    updatedAt: "2026-08-18T09:00:00.000Z"
  });
}

function assertOperatorConservation(workspace: ReturnType<typeof buildSupportOperationsWorkspace>): void {
  const totals = workspace.breakdowns.operators.reduce((sum, operator) => ({
    agentTouches: sum.agentTouches + operator.agentTouches,
    assignedBacklog: sum.assignedBacklog + operator.assignedBacklog,
    internalComments: sum.internalComments + operator.internalComments,
    resolved: sum.resolved + operator.resolved
  }), { agentTouches: 0, assignedBacklog: 0, internalComments: 0, resolved: 0 });
  assert.deepEqual(totals, {
    agentTouches: workspace.metrics.current.agentTouches,
    assignedBacklog: workspace.metrics.current.backlog,
    internalComments: workspace.metrics.current.internalComments,
    resolved: workspace.metrics.current.resolved
  });
}

function sourceRow(
  id: string,
  createdAt: string,
  overrides: Partial<SupportOperationsConversationRow> = {}
): SupportOperationsConversationRow {
  return {
    channel: "SDK",
    createdAt,
    id,
    messages: [message(`${id}-client`, createdAt, "client")],
    slaTone: "ok",
    status: "active",
    topic: "General",
    updatedAt: createdAt,
    ...overrides
  };
}

function responseMessages(createdAt: string, responseSeconds: number, operatorId?: string): SupportOperationsMessage[] {
  return [
    message("client", createdAt, "client"),
    message("agent", new Date(Date.parse(createdAt) + responseSeconds * 1_000).toISOString(), "agent", { operatorId })
  ];
}

function message(
  id: string,
  createdAt: string,
  side: "agent" | "client",
  overrides: Partial<SupportOperationsMessage> = {}
): SupportOperationsMessage {
  return { createdAt, id, side, text: id, time: createdAt.slice(11, 16), ...overrides };
}

function event(
  eventType: string,
  occurredAt: string,
  data: Record<string, unknown> = {},
  source?: string
): NonNullable<SupportOperationsConversationRow["lifecycleEvents"]>[number] {
  return { data, eventType, occurredAt, ...(source ? { source } : {}) };
}

function actorEvent(
  eventType: string,
  occurredAt: string,
  data: Record<string, unknown>,
  actor: Pick<NonNullable<SupportOperationsConversationRow["lifecycleEvents"]>[number], "actorType"> &
    Partial<Pick<NonNullable<SupportOperationsConversationRow["lifecycleEvents"]>[number], "actorId" | "actorName">>
): NonNullable<SupportOperationsConversationRow["lifecycleEvents"]>[number] {
  return { ...event(eventType, occurredAt, data, "conversation-service"), ...actor };
}
