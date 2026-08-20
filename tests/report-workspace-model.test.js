import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeReportFilters,
  createDefaultReportView,
  persistReportView,
  reportRoutingQuery,
  reportViewFromLocation,
  reportWorkspaceQuery,
  resetReportFilters,
  updateReportFilter,
  validateReportView
} from "../src/features/reports/model/reportViewState.js";
import { formatReportMetric } from "../src/features/reports/model/reportMetricRegistry.js";
import {
  normalizeReportWorkspace,
  selectTrendExplorerView
} from "../src/features/reports/model/reportWorkspaceModel.js";

describe("reports view state", () => {
  it("sends an identical custom window and timezone to workspace and routing queries", () => {
    const view = {
      ...createDefaultReportView(new Date("2026-08-18T12:00:00Z")),
      customRange: { from: "2026-07-01", to: "2026-08-18" },
      filters: {
        channel: "Telegram",
        operatorId: "operator-7",
        queueId: "queue-a",
        resolutionOutcome: "resolved",
        status: "closed",
        teamId: "team-1",
        topic: "Доставка"
      },
      period: "custom"
    };
    const timezoneOffsetMinutes = -new Date().getTimezoneOffset();

    assert.deepEqual(reportWorkspaceQuery(view), {
      channel: "Telegram",
      dateFrom: "2026-07-01",
      dateTo: "2026-08-18",
      operatorId: "operator-7",
      period: "custom",
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "closed",
      teamId: "team-1",
      timezoneOffsetMinutes,
      topic: "Доставка"
    });
    assert.deepEqual(reportRoutingQuery(view, { eventType: "transfer" }), {
      channel: "Telegram",
      dateFrom: "2026-07-01",
      dateTo: "2026-08-18",
      eventType: "transfer",
      operatorId: "operator-7",
      period: "custom",
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "closed",
      teamId: "team-1",
      timezoneOffsetMinutes,
      topic: "Доставка"
    });
  });

  it("persists the report view in the URL and restores it without losing the app hash", () => {
    const initial = new URL("https://support.example.test/app?keep=1#/app");
    const history = {
      state: { shell: true },
      replaceState(state, _title, nextUrl) {
        assert.deepEqual(state, { shell: true });
        this.nextUrl = nextUrl;
      }
    };
    const view = {
      ...createDefaultReportView(new Date("2026-08-18T12:00:00Z")),
      compare: false,
      customRange: { from: "2026-08-01", to: "2026-08-18" },
      filters: {
        channel: "MAX",
        operatorId: "all",
        queueId: "queue-priority",
        resolutionOutcome: "all",
        status: "all",
        teamId: "all",
        topic: "VIP"
      },
      period: "custom"
    };

    persistReportView(view, history, initial);

    const persisted = new URL(history.nextUrl, initial.origin);
    assert.equal(persisted.searchParams.get("keep"), "1");
    assert.equal(persisted.searchParams.get("reportPeriod"), "custom");
    assert.equal(persisted.searchParams.get("reportCompare"), "0");
    assert.equal(persisted.searchParams.get("reportFrom"), "2026-08-01");
    assert.equal(persisted.searchParams.get("reportTo"), "2026-08-18");
    assert.equal(persisted.searchParams.get("reportTrendMetric"), "volume");
    assert.equal(persisted.searchParams.get("reportTrendGrain"), "day");
    assert.equal(persisted.searchParams.get("report_channel"), "MAX");
    assert.equal(persisted.searchParams.get("report_queueId"), "queue-priority");
    assert.equal(persisted.searchParams.get("report_topic"), "VIP");
    assert.equal(persisted.searchParams.has("report_operatorId"), false, "default facets stay out of the URL");
    assert.equal(persisted.hash, "#/app");

    assert.deepEqual(reportViewFromLocation(persisted, new Date("2026-08-18T12:00:00Z")), view);
  });

  it("persists and restores the selected KPI trend while rejecting unsupported URL values", () => {
    const location = new URL("https://support.example.test/app?keep=1#/app");
    const history = { state: null, replaceState(_state, _title, nextUrl) { this.nextUrl = nextUrl; } };
    const view = {
      ...createDefaultReportView(new Date("2026-08-18T12:00:00Z")),
      trend: { grain: "month", metric: "csatAverage" }
    };

    persistReportView(view, history, location);

    const persisted = new URL(history.nextUrl, location.origin);
    assert.equal(persisted.searchParams.get("reportTrendMetric"), "csatAverage");
    assert.equal(persisted.searchParams.get("reportTrendGrain"), "month");
    assert.deepEqual(
      reportViewFromLocation(persisted, new Date("2026-08-18T12:00:00Z")).trend,
      { grain: "month", metric: "csatAverage" }
    );
    const defaultTrendView = { ...view, trend: { grain: "day", metric: "volume" } };
    assert.deepEqual(
      reportWorkspaceQuery(view),
      reportWorkspaceQuery(defaultTrendView),
      "switching the client-side chart must not refetch the report workspace"
    );
    assert.deepEqual(
      reportRoutingQuery(view),
      reportRoutingQuery(defaultTrendView),
      "switching the chart must not restart unrelated routing activity"
    );

    const unsupported = new URL("https://support.example.test/app?reportTrendMetric=made-up&reportTrendGrain=quarter#/app");
    assert.deepEqual(
      reportViewFromLocation(unsupported, new Date("2026-08-18T12:00:00Z")).trend,
      { grain: "day", metric: "volume" },
      "unknown share-link values must fail closed to the documented defaults"
    );
  });

  it("removes obsolete custom dates for a preset period", () => {
    const location = new URL("https://support.example.test/app?reportFrom=2026-01-01&reportTo=2026-01-31#/app");
    const history = { state: null, replaceState(_state, _title, nextUrl) { this.nextUrl = nextUrl; } };
    const view = createDefaultReportView(new Date("2026-08-18T12:00:00Z"));

    persistReportView(view, history, location);

    const persisted = new URL(history.nextUrl, location.origin);
    assert.equal(persisted.searchParams.get("reportPeriod"), "7days");
    assert.equal(persisted.searchParams.has("reportFrom"), false);
    assert.equal(persisted.searchParams.has("reportTo"), false);
  });

  it("rejects incomplete, reversed and overlong custom periods but accepts an inclusive 366-day window", () => {
    const base = { ...createDefaultReportView(), period: "custom" };

    assert.match(validateReportView({ ...base, customRange: { from: "", to: "2026-08-18" } }).message, /обе даты/i);
    assert.match(validateReportView({ ...base, customRange: { from: "2026-08-19", to: "2026-08-18" } }).message, /начала/i);
    assert.match(validateReportView({ ...base, customRange: { from: "2025-08-17", to: "2026-08-18" } }).message, /366 дней/i);
    assert.deepEqual(validateReportView({ ...base, customRange: { from: "2025-08-18", to: "2026-08-18" } }), {
      message: "",
      valid: true
    });
  });

  it("updates, counts and resets only active server facets", () => {
    const defaults = createDefaultReportView();
    const filtered = updateReportFilter(updateReportFilter(defaults, "channel", "SDK"), "status", "open");

    assert.deepEqual(activeReportFilters(filtered), [["channel", "SDK"], ["status", "open"]]);
    assert.deepEqual(activeReportFilters(resetReportFilters(filtered)), []);
  });
});

describe("support-ops/v2 workspace normalization", () => {
  it("selects day, week and month KPI trends without turning missing samples into zero", () => {
    const point = (from, to, metrics) => ({ from, metrics, to });
    const workspace = normalizeReportWorkspace({
      operations: {
        metrics: {
          current: {
            csatAverage: 4.5,
            csatSamples: 4,
            csatScaleMaximum: 5,
            incoming: 3,
            resolved: 2
          }
        },
        period: { timezoneOffsetMinutes: 180 },
        timeSeries: {
          current: [],
          granularity: "day",
          kpi: {
            availableGrains: ["day", "week", "month"],
            byGrain: {
              day: {
                current: [
                  point("2026-08-16T21:00:00.000Z", "2026-08-17T21:00:00.000Z", {
                    firstResponseP50Seconds: { samples: 0, value: null },
                    firstResponseP90Seconds: { samples: 0, value: null },
                    incoming: { samples: 0, value: 0 },
                    resolved: { samples: 0, value: 0 }
                  }),
                  point("2026-08-17T21:00:00.000Z", "2026-08-18T21:00:00.000Z", {
                    firstResponseP50Seconds: { samples: 1, value: 0 },
                    firstResponseP90Seconds: { samples: 1, value: 120 },
                    incoming: { samples: 3, value: 3 },
                    resolved: { samples: 2, value: 2 }
                  })
                ],
                previous: []
              },
              week: {
                current: [point("2026-08-02T21:00:00.000Z", "2026-08-09T21:00:00.000Z", {
                  incoming: { samples: 7, value: 7 },
                  resolved: { samples: 6, value: 6 }
                })],
                previous: []
              },
              month: {
                current: [
                  point("2026-06-30T21:00:00.000Z", "2026-07-31T21:00:00.000Z", {
                    csatAverage: { samples: 0, value: null }
                  }),
                  point("2026-07-31T21:00:00.000Z", "2026-08-31T21:00:00.000Z", {
                    csatAverage: { samples: 4, scaleMaximum: 5, value: 4.5 }
                  })
                ],
                previous: []
              }
            }
          },
          previous: []
        },
        version: "support-ops/v2"
      }
    });
    const explorer = workspace.operations.trendExplorer;

    assert.deepEqual(explorer.availableGrains, ["day", "week", "month"]);
    assert.deepEqual(explorer.metricOptions.map(({ key }) => key), [
      "volume",
      "queueHealth",
      "firstResponse",
      "nextResponse",
      "resolution",
      "fullResolution",
      "slaAttainment",
      "csatAverage",
      "csatPositiveRate",
      "csatCoverage",
      "responseCoverage",
      "reopenRate",
      "oneTouchRate",
      "workload"
    ]);
    assert.equal(explorer.metricOptions.find(({ key }) => key === "oneTouchRate")?.label, "Решено с одного касания");

    const responseTrend = selectTrendExplorerView(explorer, { grain: "day", metric: "firstResponse" });
    assert.equal(responseTrend.title, "Время первого ответа");
    assert.deepEqual(responseTrend.series.map(({ key }) => key), ["firstResponseMedianSeconds", "firstResponseP90Seconds"]);
    assert.deepEqual(responseTrend.series[0].values, [null, 0], "a real zero-duration sample must remain distinct from unavailable data");
    assert.deepEqual(responseTrend.series[0].samples, [0, 1]);
    assert.match(responseTrend.rows[1].label, /18.*авг/i, "day labels use the report timezone");

    const weeklyVolume = selectTrendExplorerView(explorer, { grain: "week", metric: "volume" });
    assert.match(weeklyVolume.rows[0].label, /3.*авг.*9.*авг/i, "ISO-week labels expose the local Monday-to-Sunday bucket");

    const monthlyCsat = selectTrendExplorerView(explorer, { grain: "month", metric: "csatAverage" });
    assert.deepEqual(monthlyCsat.domain, { max: 5, min: 0 });
    assert.deepEqual(monthlyCsat.series[0].values, [null, 4.5]);
    assert.deepEqual(monthlyCsat.series[0].samples, [0, 4]);
    assert.equal(monthlyCsat.rows[1].metrics.csatAverage.scaleMaximum, 5, "CSAT scale evidence survives normalization");
    assert.match(monthlyCsat.rows[1].label, /авг.*2026/i, "month labels use local calendar months");

    const invalid = selectTrendExplorerView(explorer, { grain: "quarter", metric: "made-up" });
    assert.equal(invalid.grain, "day");
    assert.equal(invalid.metric, "volume");
    assert.deepEqual(invalid.series.map(({ key }) => key), ["incoming", "resolved", "backlog"], "the default chart preserves all three legacy series");
  });

  it("preserves operational diagnostic values and their measurement evidence", () => {
    const workspace = normalizeReportWorkspace({
      operations: {
        metrics: {
          current: {
            csatCoveragePercent: 75,
            csatSamples: 3,
            firstResponseCoveragePercent: 50,
            firstResponseSamples: 2,
            incoming: 4,
            internalComments: 0,
            nextResponseMedianSeconds: 120,
            nextResponseP90Seconds: 600,
            nextResponseSamples: 3,
            oneTouchResolutionPercent: 50,
            oneTouchResolutionSamples: 2,
            resolved: 2,
            slaBreaches: 0,
            waiting: 0
          }
        },
        version: "support-ops/v2"
      }
    });
    const { metrics } = workspace.operations;

    assert.equal(metrics.flowRatio.value, 0.5);
    assert.equal(metrics.csatCoverage.value, 75);
    assert.equal(metrics.csatCoverage.sampleSize, 3);
    assert.equal(metrics.waiting.value, 0);
    assert.equal(metrics.overdue.value, 0);
    assert.equal(metrics.responseCoverage.value, 50);
    assert.equal(metrics.responseCoverage.sampleSize, 2);
    assert.equal(metrics.responseCoverage.numerator, 2);
    assert.equal(metrics.responseCoverage.denominator, 4);
    assert.equal(metrics.oneTouchRate.value, 50);
    assert.equal(metrics.oneTouchRate.sampleSize, 2);
    assert.equal(metrics.nextResponseMedianSeconds.value, 120);
    assert.equal(metrics.nextResponseMedianSeconds.sampleSize, 3);
    assert.equal(metrics.nextResponseP90Seconds.value, 600);
    assert.equal(metrics.nextResponseP90Seconds.sampleSize, 3);
    assert.equal(metrics.internalComments.value, 0);
    assert.equal(formatReportMetric(metrics.waiting), "0");
    assert.equal(formatReportMetric(metrics.internalComments), "0");
  });

  it("keeps unavailable operational diagnostics null while preserving zero-sized samples", () => {
    const workspace = normalizeReportWorkspace({
      operations: {
        metrics: {
          current: {
            csatCoveragePercent: null,
            csatSamples: 0,
            firstResponseCoveragePercent: null,
            firstResponseSamples: 0,
            incoming: 0,
            internalComments: 0,
            nextResponseMedianSeconds: null,
            nextResponseP90Seconds: null,
            nextResponseSamples: 0,
            oneTouchResolutionPercent: null,
            oneTouchResolutionSamples: 0,
            resolved: 0,
            slaBreaches: 0,
            waiting: 0
          }
        },
        version: "support-ops/v2"
      }
    });
    const { metrics } = workspace.operations;

    assert.equal(formatReportMetric(metrics.flowRatio, "flowRatio"), "—");
    assert.equal(metrics.csatCoverage.value, null);
    assert.equal(metrics.csatCoverage.sampleSize, 0);
    assert.equal(formatReportMetric(metrics.csatCoverage), "—");
    assert.equal(metrics.responseCoverage.value, null);
    assert.equal(metrics.responseCoverage.sampleSize, 0);
    assert.equal(metrics.responseCoverage.numerator, 0);
    assert.equal(metrics.responseCoverage.denominator, 0);
    assert.equal(formatReportMetric(metrics.responseCoverage), "—");
    assert.equal(metrics.oneTouchRate.value, null);
    assert.equal(metrics.oneTouchRate.sampleSize, 0);
    assert.equal(formatReportMetric(metrics.oneTouchRate), "—");
    assert.equal(metrics.nextResponseMedianSeconds.value, null);
    assert.equal(metrics.nextResponseMedianSeconds.sampleSize, 0);
    assert.equal(formatReportMetric(metrics.nextResponseMedianSeconds), "—");
    assert.equal(metrics.nextResponseP90Seconds.value, null);
    assert.equal(metrics.nextResponseP90Seconds.sampleSize, 0);
    assert.equal(formatReportMetric(metrics.nextResponseP90Seconds), "—");
    assert.equal(formatReportMetric(metrics.waiting), "0");
    assert.equal(formatReportMetric(metrics.overdue), "0");
    assert.equal(formatReportMetric(metrics.internalComments), "0");
  });

  it("preserves unavailable metrics as null while keeping real zeros distinct", () => {
    const workspace = normalizeReportWorkspace({
      operations: {
        metrics: {
          current: {
            backlog: { value: 0, previous: 3 },
            csatAverage: {
              sampleSize: 0,
              unavailableReason: "За период нет сохранённых оценок",
              value: null
            },
            incoming: { value: 0, previous: 0 },
            resolved: { value: 12, previous: 10 },
            slaAttainment: {
              denominator: 0,
              numerator: 0,
              unavailableReason: "SLA-политики не настроены",
              value: null
            }
          }
        },
        source: "conversation_lifecycle_events",
        version: "support-ops/v2"
      }
    });

    assert.equal(workspace.operations.version, "support-ops/v2");
    assert.equal(workspace.operations.metrics.backlog.value, 0);
    assert.equal(formatReportMetric(workspace.operations.metrics.backlog), "0");
    assert.equal(workspace.operations.metrics.csatAverage.value, null);
    assert.equal(workspace.operations.metrics.csatAverage.sampleSize, 0);
    assert.equal(workspace.operations.metrics.csatAverage.unavailableReason, "За период нет сохранённых оценок");
    assert.equal(formatReportMetric(workspace.operations.metrics.csatAverage), "—");
    assert.equal(workspace.operations.metrics.slaAttainment.value, null);
    assert.equal(workspace.operations.metrics.slaAttainment.numerator, 0);
    assert.equal(workspace.operations.metrics.slaAttainment.denominator, 0);
    assert.equal(workspace.operations.metrics.slaAttainment.unavailableReason, "SLA-политики не настроены");
    assert.equal(workspace.operations.metrics.incoming.delta, null, "zero baseline must not invent an infinite delta");
    assert.equal(workspace.hasActivity, true, "a non-zero resolved count marks the snapshot as active");
  });

  it("normalizes incoming, resolved and backlog as three complete series without lifting zero values", () => {
    const workspace = normalizeReportWorkspace({
      operations: {
        metrics: { current: { backlog: 0, incoming: 4, resolved: 3 } },
        timeSeries: {
          grain: "day",
          rows: [
            { backlog: 0, incoming: 0, label: "1 авг", resolved: 0 },
            { backlog: 3, incoming: 4, label: "2 авг", resolved: 1 },
            { backlog: 0, incoming: 0, label: "3 авг", resolved: 2 }
          ]
        },
        version: "support-ops/v2"
      }
    });
    const trend = workspace.operations.timeSeries;

    assert.deepEqual(trend.series.map(({ key }) => key), ["incoming", "resolved", "backlog"]);
    assert.deepEqual(trend.series.map(({ values }) => values), [
      [0, 4, 0],
      [0, 1, 2],
      [0, 3, 0]
    ]);
    assert.deepEqual(trend.rows[0], {
      backlog: 0,
      incoming: 0,
      label: "1 авг",
      resolved: 0,
      timestamp: null
    });
  });

  it("normalizes aliases, definitions and columnar trend payloads from compatible v2 producers", () => {
    const workspace = normalizeReportWorkspace({
      supportOperations: {
        definitions: [{ id: "slaPercent", name: "Записанный SLA", source: "events" }],
        kpis: {
          backlogCount: { value: 8 },
          firstResponseP50Seconds: { samples: 4, value: 95 },
          slaPercent: { denominator: 10, numerator: 9, value: 90 }
        },
        series: {
          backlog: [1, 0],
          incoming: [2, 0],
          labels: ["пн", "вт"],
          resolved: [1, 2]
        },
        version: "support-ops/v2"
      }
    });

    assert.equal(workspace.operations.metrics.backlog.value, 8);
    assert.equal(workspace.operations.metrics.firstResponseMedianSeconds.value, 95);
    assert.equal(workspace.operations.metrics.firstResponseMedianSeconds.sampleSize, 4);
    assert.equal(workspace.operations.metrics.slaAttainment.value, 90);
    assert.equal(workspace.operations.definitions[0].key, "slaAttainment");
    assert.deepEqual(workspace.operations.timeSeries.series.map((series) => series.values), [
      [2, 0],
      [1, 2],
      [1, 0]
    ]);
  });

  it("consumes the exact support-ops/v2 backend contract without dropping samples, quantiles or aggregation metadata", () => {
    const workspace = normalizeReportWorkspace({
      operations: {
        backlogAge: [{ count: 2, key: "under_4h", sharePercent: 100 }],
        breakdowns: { channels: [], operators: [], topics: [] },
        comparisons: {
          incoming: { absolute: 2, comparable: true, percent: 50 }
        },
        generatedAt: "2026-08-18T12:00:00.000Z",
        insights: [{ code: "sla_breaches", current: 2, metric: "slaAttainmentPercent", severity: "warning" }],
        metricDefinitions: [{ caveats: [], formula: "attained / recorded", key: "slaAttainmentPercent", source: ["lifecycle"], unit: "percent" }],
        metrics: {
          current: {
            backlog: 2,
            csatAverage: 8.5,
            csatCoveragePercent: 83.3,
            csatPositiveRatePercent: 80,
            csatScaleMaximum: 10,
            csatSamples: 5,
            firstResolutionMedianSeconds: 900,
            firstResolutionP90Seconds: 1_800,
            firstResolutionSamples: 6,
            firstResponseCoveragePercent: 75,
            firstResponseMedianSeconds: 60,
            firstResponseP90Seconds: 240,
            firstResponseSamples: 8,
            incoming: 6,
            oneTouchResolutionCount: 3,
            oneTouchResolutionPercent: 50,
            oneTouchResolutionSamples: 6,
            reopenedConversations: 1,
            reopenRatePercent: 16.7,
            resolved: 6,
            slaAttainmentPercent: 80,
            slaBreaches: 2,
            slaRecordedSamples: 10,
            waiting: 1
          },
          previous: {
            backlog: 1,
            incoming: 4,
            resolved: 3,
            slaAttainmentPercent: 90
          }
        },
        period: {
          current: { from: "2026-08-18T00:00:00.000Z", to: "2026-08-18T12:00:00.000Z" },
          isCurrentWindowPartial: true,
          kind: "today",
          previous: { from: "2026-08-17T00:00:00.000Z", to: "2026-08-17T12:00:00.000Z" },
          timezoneOffsetMinutes: 180
        },
        source: { rowCount: 6, rowsWithLifecycleEvents: 6, type: "conversation-report-source-row" },
        timeSeries: {
          aggregated: true,
          aggregationReason: "custom_range_exceeds_93_days",
          current: [
            { backlog: 0, from: "2026-08-18T00:00:00.000Z", incoming: 0, resolved: 0, to: "2026-08-18T01:00:00.000Z" },
            { backlog: 2, from: "2026-08-18T01:00:00.000Z", incoming: 6, resolved: 4, to: "2026-08-18T02:00:00.000Z" }
          ],
          granularity: "hour",
          previous: []
        },
        version: "support-ops/v2"
      }
    });
    const { metrics, serviceLevel, timeSeries } = workspace.operations;

    assert.equal(metrics.slaAttainment.value, 80);
    assert.equal(metrics.slaAttainment.denominator, 10);
    assert.equal(metrics.slaAttainment.numerator, 8);
    assert.equal(metrics.reopenRate.value, 16.7);
    assert.equal(metrics.reopenRate.numerator, 1);
    assert.equal(metrics.reopenRate.denominator, 6);
    assert.equal(metrics.oneTouchRate.value, 50);
    assert.equal(metrics.oneTouchRate.sampleSize, 6);
    assert.equal(metrics.oneTouchRate.numerator, 3);
    assert.equal(metrics.oneTouchRate.denominator, 6);
    assert.equal(metrics.responseCoverage.value, 75);
    assert.equal(metrics.firstResponseMedianSeconds.sampleSize, 8);
    assert.equal(metrics.resolutionMedianSeconds.value, 900);
    assert.equal(metrics.resolutionMedianSeconds.sampleSize, 6);
    assert.equal(metrics.resolutionP90Seconds.value, 1_800);
    assert.equal(metrics.csatAverage.sampleSize, 5);
    assert.equal(metrics.csatAverage.scaleMaximum, 10);
    assert.equal(formatReportMetric(metrics.csatAverage), "8,5 / 10");
    assert.equal(metrics.csatCoverage.numerator, 5);
    assert.equal(metrics.csatCoverage.denominator, 6);
    assert.equal(metrics.csatPositiveRate.value, 80);
    assert.deepEqual(serviceLevel.sla, { breaches: 2, denominator: 10, numerator: 8, value: 80 });
    assert.equal(timeSeries.grain, "hour");
    assert.equal(timeSeries.aggregated, true);
    assert.equal(timeSeries.aggregationReason, "custom_range_exceeds_93_days");
    assert.equal(timeSeries.rows[0].timestamp, "2026-08-18T00:00:00.000Z");
    assert.equal(timeSeries.rows[0].label, "03:00", "axis labels must use the report timezone, not raw UTC");
    const period = {
      current: { from: "2026-08-18T00:00:00.000Z", to: "2026-08-18T12:00:00.000Z" },
      isCurrentWindowPartial: true,
      kind: "today",
      previous: { from: "2026-08-17T00:00:00.000Z", to: "2026-08-17T12:00:00.000Z" },
      timezoneOffsetMinutes: 180
    };
    assert.deepEqual(workspace.operations.period, period);
    assert.deepEqual(workspace.operations.windows, { current: period.current, previous: period.previous });
    assert.equal(workspace.operations.insights[0].severity, "warning");
    assert.equal(workspace.operations.definitions[0].key, "slaAttainment");
    assert.equal(workspace.operations.definitions[0].label, "SLA без нарушения");
  });
});
