import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { FeatureFlagService } from "../apps/api-gateway/src/feature-flags/feature-flag.service.ts";
import { IncidentService } from "../apps/api-gateway/src/incidents/incident.service.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";
import { PlatformMonitoringService } from "../apps/api-gateway/src/platform/platform-monitoring.service.ts";
import { bootstrapPlatformState } from "../apps/api-gateway/src/platform/seed.ts";

function seededPlatformRepository(): PlatformRepository {
  return PlatformRepository.inMemory(bootstrapPlatformState());
}

describe("phase 9 platform monitoring, incidents and feature flag backend contracts", () => {
  it("keeps the default platform workspace empty when no seed or telemetry is present", async () => {
    const repository = PlatformRepository.inMemory();
    const snapshot = await new PlatformMonitoringService(repository).fetchPlatformSnapshot();

    assert.deepEqual(repository.listComponents(), []);
    assert.deepEqual(repository.listIncidents(), []);
    assert.deepEqual(repository.listStaticMetrics(), []);
    assert.equal(snapshot.data.dataState, "empty");
    assert.deepEqual(snapshot.data.components, []);
    assert.deepEqual(snapshot.data.healthRollups, []);
    assert.deepEqual(snapshot.data.incidents, []);
    assert.deepEqual(snapshot.data.metrics, []);
    assert.deepEqual(snapshot.data.summary, {
      affectedTenants: 0,
      degraded: 0,
      globalUptime: null,
      openIncidents: 0,
      sloBurnRate: null
    });
  });

  it("derives the platform workspace from persisted health and telemetry", async () => {
    const repository = PlatformRepository.inMemory();
    repository.saveTelemetrySample({
      componentId: "cmp-runtime-only",
      id: "telemetry-runtime-only",
      metricKey: "slo_burn_rate",
      sampledAt: "2026-07-11T08:20:00.000Z",
      source: "service-metrics",
      tags: {},
      tenantId: null,
      unit: "ratio",
      value: 0.75
    });
    repository.saveHealthRollup({
      availability: 99.8,
      componentId: "cmp-runtime-only",
      errorRate: 0.02,
      generatedAt: "2026-07-11T08:21:00.000Z",
      id: "health-runtime-only",
      incidentIds: [],
      latencyP95Ms: 240,
      sampleCount: 20,
      status: "degraded",
      windowEnd: "2026-07-11T08:20:00.000Z",
      windowStart: "2026-07-11T08:15:00.000Z"
    });

    const snapshot = await new PlatformMonitoringService(repository).fetchPlatformSnapshot();

    assert.equal(snapshot.data.dataState, "available");
    assert.deepEqual(snapshot.data.components, [{
      dependencies: [],
      errorRate: 0.02,
      id: "cmp-runtime-only",
      latencyMs: 240,
      name: "cmp-runtime-only",
      ownerTeam: "unknown",
      recentEvents: [],
      region: "unknown",
      signals: [],
      status: "degraded",
      tenantImpact: 0,
      uptime: 99.8
    }]);
    assert.equal(snapshot.data.metrics[0].id, "telemetry-runtime-only");
    assert.equal(snapshot.data.summary.sloBurnRate, 0.75);
  });

  it("defines repository contracts for platform telemetry samples", () => {
    const repository = seededPlatformRepository();

    const saved = repository.saveTelemetrySample({
      componentId: "cmp-webhooks",
      id: "telemetry-webhook-p95-001",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-01T08:00:00.000Z",
      source: "synthetic-probe",
      tags: { route: "/api/v1/integrations/webhooks" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 842
    });
    saved.value = 1;
    repository.saveTelemetrySample({
      componentId: "cmp-webhooks",
      id: "telemetry-webhook-p95-002",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-01T08:05:00.000Z",
      source: "synthetic-probe",
      tags: { route: "/api/v1/integrations/webhooks" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 901
    });
    repository.saveTelemetrySample({
      componentId: "cmp-auth",
      id: "telemetry-auth-error-001",
      metricKey: "error_rate",
      sampledAt: "2026-07-01T08:03:00.000Z",
      source: "service-metrics",
      tags: {},
      tenantId: null,
      unit: "ratio",
      value: 0.02
    });

    const filtered = repository.listTelemetrySamples({
      componentId: "cmp-webhooks",
      metricKey: "latency_p95_ms",
      since: "2026-07-01T08:01:00.000Z",
      tenantId: "tenant-volga"
    });

    assert.deepEqual(filtered.map((sample) => sample.id), ["telemetry-webhook-p95-002"]);
    assert.equal(filtered[0].value, 901);
    filtered[0].value = 2;
    assert.equal(repository.listTelemetrySamples({ componentId: "cmp-webhooks" })[0].value, 901);
    assert.deepEqual(repository.listTelemetrySamples({ until: "2026-07-01T08:03:00.000Z" }).map((sample) => sample.id), [
      "telemetry-auth-error-001",
      "telemetry-webhook-p95-001"
    ]);
  });

  it("defines repository contracts for component health rollups", () => {
    const repository = seededPlatformRepository();

    const saved = repository.saveHealthRollup({
      availability: 99.91,
      componentId: "cmp-webhooks",
      errorRate: 0.012,
      generatedAt: "2026-07-01T08:06:00.000Z",
      id: "health-rollup-webhooks-0800",
      incidentIds: ["inc-webhook-retry"],
      latencyP95Ms: 901,
      sampleCount: 12,
      status: "degraded",
      windowEnd: "2026-07-01T08:05:00.000Z",
      windowStart: "2026-07-01T08:00:00.000Z"
    });
    saved.status = "operational";
    repository.saveHealthRollup({
      availability: 99.99,
      componentId: "cmp-auth",
      errorRate: 0.001,
      generatedAt: "2026-07-01T08:06:00.000Z",
      id: "health-rollup-auth-0800",
      incidentIds: [],
      latencyP95Ms: 120,
      sampleCount: 8,
      status: "operational",
      windowEnd: "2026-07-01T08:05:00.000Z",
      windowStart: "2026-07-01T08:00:00.000Z"
    });
    repository.saveHealthRollup({
      availability: 99.93,
      componentId: "cmp-webhooks",
      errorRate: 0.01,
      generatedAt: "2026-07-01T08:11:00.000Z",
      id: "health-rollup-webhooks-0805",
      incidentIds: ["inc-webhook-retry"],
      latencyP95Ms: 870,
      sampleCount: 14,
      status: "degraded",
      windowEnd: "2026-07-01T08:10:00.000Z",
      windowStart: "2026-07-01T08:05:00.000Z"
    });

    const filtered = repository.listHealthRollups({
      componentId: "cmp-webhooks",
      since: "2026-07-01T08:04:00.000Z",
      status: "degraded"
    });

    assert.deepEqual(filtered.map((rollup) => rollup.id), ["health-rollup-webhooks-0805", "health-rollup-webhooks-0800"]);
    assert.equal(filtered[0].status, "degraded");
    filtered[0].status = "operational";
    assert.equal(repository.listHealthRollups({ componentId: "cmp-webhooks" })[0].status, "degraded");
    assert.deepEqual(repository.listHealthRollups({ until: "2026-07-01T08:05:00.000Z" }).map((rollup) => rollup.id), [
      "health-rollup-webhooks-0800",
      "health-rollup-auth-0800"
    ]);
  });

  it("defines repository contracts for alert routing rules", () => {
    const repository = seededPlatformRepository();

    const saved = repository.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      createdAt: "2026-07-01T08:00:00.000Z",
      destination: {
        channel: "slack",
        target: "#platform-alerts"
      },
      enabled: true,
      id: "route-webhook-critical",
      severities: ["critical", "warning"],
      statuses: ["degraded", "down"],
      updatedAt: "2026-07-01T08:00:00.000Z"
    });
    saved.destination.target = "#mutated";
    repository.saveAlertRoutingRule({
      componentIds: ["cmp-auth"],
      createdAt: "2026-07-01T08:02:00.000Z",
      destination: {
        channel: "email",
        target: "oncall@example.test"
      },
      enabled: false,
      id: "route-auth-warning",
      severities: ["warning"],
      statuses: ["degraded"],
      updatedAt: "2026-07-01T08:02:00.000Z"
    });
    repository.saveAlertRoutingRule({
      componentIds: [],
      createdAt: "2026-07-01T08:01:00.000Z",
      destination: {
        channel: "pagerduty",
        target: "platform-primary"
      },
      enabled: true,
      id: "route-global-critical",
      severities: ["critical"],
      statuses: [],
      updatedAt: "2026-07-01T08:01:00.000Z"
    });

    const filtered = repository.listAlertRoutingRules({
      componentId: "cmp-webhooks",
      enabled: true,
      severity: "critical",
      status: "degraded"
    });

    assert.deepEqual(filtered.map((rule) => rule.id), ["route-global-critical", "route-webhook-critical"]);
    assert.equal(filtered[1].destination.target, "#platform-alerts");
    assert.deepEqual(repository.listAlertRoutingRules({ enabled: false }).map((rule) => rule.id), ["route-auth-warning"]);

    repository.saveAlertRoutingRule({
      componentIds: ["cmp-events"],
      createdAt: "2026-07-01T08:04:00.000Z",
      destination: {
        channel: "slack",
        target: "#platform-events"
      },
      enabled: true,
      id: "route-events-critical-a",
      severities: ["critical"],
      statuses: ["down"],
      updatedAt: "2026-07-01T08:04:00.000Z"
    });
    repository.saveAlertRoutingRule({
      componentIds: ["cmp-search"],
      createdAt: "2026-07-01T08:04:00.000Z",
      destination: {
        channel: "slack",
        target: "#platform-search"
      },
      enabled: true,
      id: "route-search-critical-z",
      severities: ["critical"],
      statuses: ["down"],
      updatedAt: "2026-07-01T08:04:00.000Z"
    });
    assert.deepEqual(repository.listAlertRoutingRules({ destinationChannel: "slack" }).map((rule) => rule.id).slice(0, 2), [
      "route-search-critical-z",
      "route-events-critical-a"
    ]);

    filtered[1].destination.target = "#mutated-again";
    assert.equal(repository.listAlertRoutingRules({ componentId: "cmp-webhooks" })[1].destination.target, "#platform-alerts");

    repository.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      createdAt: "2026-07-01T08:00:00.000Z",
      destination: {
        channel: "slack",
        target: "#platform-critical"
      },
      enabled: true,
      id: "route-webhook-critical",
      severities: ["critical"],
      statuses: ["degraded"],
      updatedAt: "2026-07-01T08:03:00.000Z"
    });

    const updatedWebhookRoute = repository
      .listAlertRoutingRules({ destinationChannel: "slack" })
      .find((rule) => rule.id === "route-webhook-critical");
    assert.equal(updatedWebhookRoute?.destination.target, "#platform-critical");
    assert.deepEqual(repository.readState().alertRoutingRules.map((rule) => rule.id).sort(), [
      "route-auth-warning",
      "route-events-critical-a",
      "route-global-critical",
      "route-search-critical-z",
      "route-webhook-critical"
    ]);
  });

  it("defines repository contracts for alert acknowledgement audit rows", () => {
    const repository = seededPlatformRepository();

    const saved = repository.savePlatformAuditRow({
      action: "platform.alert.acknowledge",
      actor: "svc-admin-001",
      actorName: "Service Admin",
      createdAt: "2026-07-01T08:10:00.000Z",
      fingerprint: "fp-alert-webhooks-ack",
      id: "audit-alert-webhooks-ack",
      idempotencyKey: "platform-audit:alert:ack-webhooks-001",
      immutable: true,
      mutationKind: "alert",
      payload: {
        componentId: "cmp-webhooks",
        routeId: "route-webhook-critical"
      },
      reason: "Acknowledged by integrations on-call",
      result: "queued",
      target: "cmp-webhooks",
      traceId: "trc-alert-ack-webhooks"
    });
    saved.payload.componentId = "mutated";

    repository.savePlatformAuditRow({
      action: "platform.alert.acknowledge",
      actor: "svc-admin-002",
      actorName: "Service Admin",
      createdAt: "2026-07-01T08:12:00.000Z",
      fingerprint: "fp-alert-auth-ack",
      id: "audit-alert-auth-ack",
      idempotencyKey: "platform-audit:alert:ack-auth-001",
      immutable: true,
      mutationKind: "alert",
      payload: {
        componentId: "cmp-auth",
        routeId: "route-auth-warning"
      },
      reason: "Acknowledged by identity on-call",
      result: "queued",
      target: "cmp-auth",
      traceId: "trc-alert-ack-auth"
    });

    const replay = repository.savePlatformAuditRow({
      action: "platform.alert.acknowledge",
      actor: "svc-admin-001",
      actorName: "Service Admin",
      createdAt: "2026-07-01T08:10:00.000Z",
      fingerprint: "fp-alert-webhooks-ack",
      id: "audit-alert-webhooks-ack",
      idempotencyKey: "platform-audit:alert:ack-webhooks-001",
      immutable: true,
      mutationKind: "alert",
      payload: {
        componentId: "cmp-webhooks",
        routeId: "route-webhook-critical"
      },
      reason: "Acknowledged by integrations on-call",
      result: "queued",
      target: "cmp-webhooks",
      traceId: "trc-alert-ack-webhooks"
    });

    assert.equal(replay.payload.componentId, "cmp-webhooks");
    assert.throws(() =>
      repository.savePlatformAuditRow({
        ...replay,
        fingerprint: "different-fingerprint",
        reason: "Different acknowledgement reason"
      }),
    /platform_audit_immutable/);
    assert.deepEqual(repository.listPlatformAuditRows({
      mutationKind: "alert",
      target: "cmp-webhooks"
    }).map((row) => row.id), ["audit-alert-webhooks-ack"]);
    assert.deepEqual(repository.listPlatformAuditRows({ idempotencyKey: "platform-audit:alert:ack-auth-001" }).map((row) => row.id), [
      "audit-alert-auth-ack"
    ]);
  });

  it("persists alert routing rule updates through the platform runtime", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const created = await platform.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      destination: {
        channel: "slack",
        target: "#platform-alerts"
      },
      enabled: true,
      ruleId: "route-webhook-critical",
      severities: ["critical"],
      statuses: ["degraded"]
    });

    assert.equal(created.status, "ok");
    assert.equal(created.operation, "saveAlertRoutingRule");
    assert.equal(created.data.rule.id, "route-webhook-critical");
    assert.equal(created.data.rule.destination.target, "#platform-alerts");
    assert.deepEqual(repository.listAlertRoutingRules({ componentId: "cmp-webhooks" }).map((rule) => rule.id), [
      "route-webhook-critical"
    ]);

    const updated = await platform.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      destination: {
        channel: "pagerduty",
        target: "platform-primary"
      },
      enabled: false,
      ruleId: "route-webhook-critical",
      severities: ["critical"],
      statuses: ["down"]
    });

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.rule.createdAt, created.data.rule.createdAt);
    assert.equal(updated.data.rule.destination.channel, "pagerduty");
    assert.equal(updated.data.rule.enabled, false);
    assert.deepEqual(repository.readState().alertRoutingRules.map((rule) => rule.id), ["route-webhook-critical"]);
  });

  it("returns platform snapshot metrics and component drilldown", async () => {
    const platform = new PlatformMonitoringService(seededPlatformRepository());

    const snapshot = await platform.fetchPlatformSnapshot({ status: "degraded" });
    assert.equal(snapshot.service, "platformMonitoringService");
    assert.equal(snapshot.status, "ok");
    assert.equal(snapshot.partial, true);
    assert.ok(snapshot.data.components.every((component) => component.status !== "operational"));
    assert.ok(snapshot.data.incidents.every((incident) => snapshot.data.components.some((component) => component.id === incident.componentId)));
    assert.ok(snapshot.data.metrics.every((metric) => snapshot.data.components.some((component) => component.id === metric.componentId)));
    assert.equal(typeof snapshot.data.summary.globalUptime, "number");
    assert.equal(snapshot.data.summary.sloBurnRate, null);
    assert.ok(snapshot.data.metrics.some((metric) => metric.id === "webhook_retry_queue"));

    const drilldown = await platform.fetchComponentDrilldown("cmp-webhooks");
    assert.equal(drilldown.status, "ok");
    assert.equal(drilldown.data.component.id, "cmp-webhooks");
    assert.ok(drilldown.data.affectedTenants.some((tenant) => tenant.id === "tenant-volga"));
    assert.deepEqual(drilldown.data.runbooks, []);

    const missing = await platform.fetchComponentDrilldown("cmp-missing");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "component_not_found");
  });

  it("ingests platform telemetry samples with bounded retention metadata", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const ingested = await platform.ingestTelemetrySample({
      componentId: "cmp-webhooks",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-01T08:15:00.000Z",
      source: "synthetic-probe",
      tags: { route: "/api/v1/integrations/webhooks" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 876
    });

    assert.equal(ingested.status, "ok");
    assert.equal(ingested.service, "platformMonitoringService");
    assert.equal(ingested.operation, "ingestTelemetrySample");
    assert.match(String(ingested.data.sample.id), /^telemetry-sample-/);
    assert.deepEqual(ingested.data.retention, {
      expiresAt: "2026-07-31T08:15:00.000Z",
      policy: "platform-telemetry-samples-30d",
      retentionDays: 30
    });
    assert.deepEqual(repository.listTelemetrySamples({ componentId: "cmp-webhooks" }).map((sample) => sample.id), [
      ingested.data.sample.id
    ]);
    assert.equal(repository.listTelemetrySamples({ componentId: "cmp-webhooks" })[0].value, 876);
  });

  it("writes component health rollups with bounded retention metadata", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const written = await platform.writeHealthRollup({
      availability: 99.93,
      componentId: "cmp-webhooks",
      errorRate: 0.01,
      generatedAt: "2026-07-01T08:11:00.000Z",
      incidentIds: ["inc-webhook-retry"],
      latencyP95Ms: 870,
      sampleCount: 14,
      status: "degraded",
      windowEnd: "2026-07-01T08:10:00.000Z",
      windowStart: "2026-07-01T08:05:00.000Z"
    });

    assert.equal(written.status, "ok");
    assert.equal(written.operation, "writeHealthRollup");
    assert.match(String(written.data.rollup.id), /^health-rollup-/);
    assert.deepEqual(written.data.retention, {
      expiresAt: "2026-09-29T08:10:00.000Z",
      policy: "platform-health-rollups-90d",
      retentionDays: 90
    });
    assert.deepEqual(repository.listHealthRollups({ componentId: "cmp-webhooks" }).map((rollup) => rollup.id), [
      written.data.rollup.id
    ]);
    assert.equal(repository.listHealthRollups({ componentId: "cmp-webhooks" })[0].status, "degraded");
  });

  it("includes persisted telemetry samples in platform snapshot metrics", async () => {
    const repository = seededPlatformRepository();
    repository.saveTelemetrySample({
      componentId: "cmp-webhooks",
      id: "telemetry-webhook-latency-live",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-01T08:20:00.000Z",
      source: "synthetic-probe",
      tags: { route: "/api/v1/integrations/webhooks" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 930
    });
    const platform = new PlatformMonitoringService(repository);

    const snapshot = await platform.fetchPlatformSnapshot({ status: "degraded" });

    assert.ok(snapshot.data.metrics.some((metric: Record<string, unknown>) => metric.id === "webhook_retry_queue"));
    assert.ok(snapshot.data.metrics.some((metric: Record<string, unknown>) =>
      metric.id === "telemetry-webhook-latency-live" &&
      metric.componentId === "cmp-webhooks" &&
      metric.value === 930 &&
      metric.source === "synthetic-probe" &&
      metric.sampledAt === "2026-07-01T08:20:00.000Z"
    ));
  });

  it("includes persisted health rollups in platform snapshot read side", async () => {
    const repository = seededPlatformRepository();
    repository.saveHealthRollup({
      availability: 99.93,
      componentId: "cmp-webhooks",
      errorRate: 0.01,
      generatedAt: "2026-07-01T08:11:00.000Z",
      id: "health-rollup-webhooks-live",
      incidentIds: ["inc-webhook-retry"],
      latencyP95Ms: 870,
      sampleCount: 14,
      status: "degraded",
      windowEnd: "2026-07-01T08:10:00.000Z",
      windowStart: "2026-07-01T08:05:00.000Z"
    });
    const platform = new PlatformMonitoringService(repository);

    const snapshot = await platform.fetchPlatformSnapshot({ status: "degraded" });

    assert.ok(snapshot.data.healthRollups.some((rollup: Record<string, unknown>) =>
      rollup.id === "health-rollup-webhooks-live" &&
      rollup.componentId === "cmp-webhooks" &&
      rollup.status === "degraded" &&
      rollup.sampleCount === 14
    ));
  });

  it("rejects malformed telemetry sample tags without persisting the sample", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const rejected = await platform.ingestTelemetrySample({
      componentId: "cmp-webhooks",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-01T08:25:00.000Z",
      source: "synthetic-probe",
      tags: ["not", "an", "object"] as unknown as Record<string, unknown>,
      tenantId: "tenant-volga",
      unit: "ms",
      value: 901
    });

    assert.equal(rejected.status, "invalid");
    assert.equal(rejected.error?.code, "telemetry_tags_invalid");
    assert.deepEqual(repository.listTelemetrySamples({ componentId: "cmp-webhooks" }), []);
  });

  it("rejects telemetry samples already outside the retention window", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const rejected = await platform.ingestTelemetrySample({
      componentId: "cmp-webhooks",
      metricKey: "latency_p95_ms",
      sampledAt: daysAgoIso(31),
      source: "synthetic-probe",
      tags: { route: "/api/v1/integrations/webhooks" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 901
    });

    assert.equal(rejected.status, "invalid");
    assert.equal(rejected.error?.code, "telemetry_retention_window_expired");
    assert.deepEqual(repository.listTelemetrySamples({ componentId: "cmp-webhooks" }), []);
  });

  it("rejects health rollups already outside the retention window", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const rejected = await platform.writeHealthRollup({
      availability: 99.93,
      componentId: "cmp-webhooks",
      errorRate: 0.01,
      generatedAt: daysAgoIso(91),
      incidentIds: ["inc-webhook-retry"],
      latencyP95Ms: 870,
      sampleCount: 14,
      status: "degraded",
      windowEnd: daysAgoIso(91),
      windowStart: daysAgoIso(91)
    });

    assert.equal(rejected.status, "invalid");
    assert.equal(rejected.error?.code, "health_rollup_retention_window_expired");
    assert.deepEqual(repository.listHealthRollups({ componentId: "cmp-webhooks" }), []);
  });

  it("requires reason and confirmation to acknowledge platform alerts", async () => {
    const platform = new PlatformMonitoringService(seededPlatformRepository());

    const missingReason = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const malformedReason = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      reason: { text: "Platform alert reviewed" } as unknown as string
    });
    assert.equal(malformedReason.status, "invalid");
    assert.equal(malformedReason.error?.code, "reason_required");

    const missingConfirmation = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      reason: "Platform alert reviewed"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");

    const acknowledged = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      reason: "Platform alert reviewed"
    });
    assert.equal(acknowledged.status, "ok");
    assert.match(acknowledged.data.auditEvent.id, /^evt_platform_component_/);
    assert.equal(acknowledged.data.auditEvent.action, "platform.alert.acknowledge");
    assert.equal(acknowledged.data.auditEvent.immutable, true);
    assert.equal(acknowledged.data.statusPageSync.queue, "status-page-sync");
  });

  it("persists alert acknowledgement audit rows idempotently at runtime", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    const first = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-webhooks-runtime-001",
      reason: "Platform alert reviewed"
    });
    const replay = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-webhooks-runtime-001",
      reason: "Platform alert reviewed"
    });

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.platformAudit.id, first.data.platformAudit.id);
    assert.equal(replay.data.platformOutbox.id, first.data.platformOutbox.id);
    assert.equal(replay.data.auditEvent.id, first.data.auditEvent.id);
    assert.equal(repository.readState().alertAcknowledgements.length, 1);
    assert.deepEqual(repository.listPlatformAuditRows({
      mutationKind: "alert",
      target: "cmp-webhooks"
    }).map((row) => row.id), [first.data.platformAudit.id]);
    assert.deepEqual(repository.listPlatformOutboxRows({ mutationKind: "alert" }).map((row) => row.id), [
      first.data.platformOutbox.id
    ]);
  });

  it("wires platform alert acknowledgement idempotency through the HTTP header", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/platform/platform.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@Headers\("idempotency-key"\)\s+idempotencyKey/);
    assert.match(source, /idempotencyKey:\s*idempotencyKey\s*\?\?\s*payload\.idempotencyKey/);
  });

  it("emits notification descriptors for routed platform alerts", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    await platform.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      destination: {
        channel: "slack",
        target: "#platform-alerts"
      },
      enabled: true,
      ruleId: "route-webhooks-slack",
      severities: ["sev2"],
      statuses: ["partial_outage"]
    });

    const acknowledged = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-webhooks-routed-notification-001",
      reason: "Platform alert reviewed"
    });

    assert.equal(acknowledged.status, "ok");
    const notificationRows = repository
      .listPlatformOutboxRows({ mutationKind: "alert" })
      .filter((row) => row.queue === "platform-notification");
    assert.equal(notificationRows.length, 1);
    assert.equal(notificationRows[0].aggregateId, "cmp-webhooks");
    assert.equal(notificationRows[0].aggregateType, "platform_component");
    assert.equal(notificationRows[0].idempotencyKey, "platform-outbox:alert-notification:ack-webhooks-routed-notification-001:route-webhooks-slack");
    assert.equal(notificationRows[0].payload.componentId, "cmp-webhooks");
    assert.equal(notificationRows[0].payload.componentStatus, "partial_outage");
    assert.equal(notificationRows[0].payload.destinationChannel, "slack");
    assert.equal(notificationRows[0].payload.destinationTarget, "#platform-alerts");
    assert.equal(notificationRows[0].payload.routeId, "route-webhooks-slack");
    assert.equal(notificationRows[0].payload.severity, "sev2");
    assert.equal(notificationRows[0].status, "pending");
    assert.equal(notificationRows[0].target, "cmp-webhooks");
    assert.equal(notificationRows[0].type, "platform.alert.notification.requested");
    assert.deepEqual(acknowledged.data.notificationOutboxRows, [notificationRows[0]]);
  });

  it("suppresses duplicate routed alert notifications across acknowledgement replays", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);

    await platform.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      destination: {
        channel: "slack",
        target: "#platform-alerts"
      },
      enabled: true,
      ruleId: "route-webhooks-replay",
      severities: ["sev2"],
      statuses: ["partial_outage"]
    });
    const first = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-webhooks-routed-replay-001",
      reason: "Platform alert reviewed"
    });

    await platform.saveAlertRoutingRule({
      componentIds: ["cmp-webhooks"],
      destination: {
        channel: "slack",
        target: "#platform-alerts-updated"
      },
      enabled: true,
      ruleId: "route-webhooks-replay",
      severities: ["sev2"],
      statuses: ["partial_outage"]
    });
    const replay = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-webhooks-routed-replay-001",
      reason: "Platform alert reviewed"
    });

    const notificationRows = repository
      .listPlatformOutboxRows({ mutationKind: "alert" })
      .filter((row) => row.queue === "platform-notification");
    assert.equal(notificationRows.length, 1);
    assert.deepEqual(replay.data.notificationOutboxRows, first.data.notificationOutboxRows);
    assert.equal(notificationRows[0].payload.destinationTarget, "#platform-alerts");
  });

  it("lists incidents, returns details and validates customer-visible updates", async () => {
    const incidents = new IncidentService(seededPlatformRepository());

    const list = await incidents.fetchIncidents({ componentId: "cmp-webhooks", status: "investigating" });
    assert.equal(list.service, "incidentService");
    assert.equal(list.status, "ok");
    assert.equal(list.partial, true);
    assert.ok(list.data.items.every((incident) => incident.componentId === "cmp-webhooks" && incident.status === "investigating"));
    assert.ok(list.data.maintenanceWindows.length > 0);

    const detail = await incidents.fetchIncidentDetail("inc-webhook-retry");
    assert.equal(detail.status, "ok");
    assert.equal(detail.data.component.id, "cmp-webhooks");
    assert.ok(detail.data.affectedTenants.some((tenant) => tenant.id === "tenant-volga"));
    assert.equal(detail.data.postmortem.status, "not_started");

    const shortMessage = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "short",
      reason: "QA incident action",
      confirmed: true,
      status: "monitoring"
    });
    assert.equal(shortMessage.status, "invalid");
    assert.equal(shortMessage.error?.code, "message_required");

    const missingConfirmation = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "Webhook delivery delay is being monitored.",
      reason: "QA incident action",
      status: "monitoring"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");

    const updated = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "Webhook delivery delay is being monitored.",
      reason: "QA incident action",
      confirmed: true,
      status: "monitoring"
    });
    assert.equal(updated.status, "ok");
    assert.equal(updated.data.incident.status, "monitoring");
    assert.equal(updated.data.incident.updates[0].text, "Webhook delivery delay is being monitored.");
    assert.equal(updated.data.auditEvent.action, "incident.update");
    assert.equal(updated.data.realtimeEvent.eventName, "incident.updated");
    assert.equal(updated.data.statusPageSync.queue, "status-page-sync");

    const privateUpdate = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "Internal remediation note only.",
      reason: "QA private incident action",
      confirmed: true,
      customerVisible: false,
      status: "monitoring"
    });
    assert.equal(privateUpdate.status, "ok");
    assert.equal(privateUpdate.data.statusPageSync, null);

    const invalidStatus = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      message: "Invalid status should be rejected.",
      reason: "QA incident action",
      confirmed: true,
      status: "paused" as unknown as "monitoring"
    });
    assert.equal(invalidStatus.status, "invalid");
    assert.equal(invalidStatus.error?.code, "incident_status_unsupported");

    const idempotent = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      idempotencyKey: "incident-runtime-idempotency",
      message: "Webhook delay remains under observation.",
      reason: "QA idempotent incident",
      confirmed: true,
      status: "monitoring"
    });
    assert.equal(idempotent.status, "ok");

    const duplicate = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      idempotencyKey: "incident-runtime-idempotency",
      message: "Webhook delay remains under observation.",
      reason: "QA idempotent incident",
      confirmed: true,
      status: "monitoring"
    });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.incident.id, idempotent.data.incident.id);

    const idempotencyConflict = await incidents.addIncidentUpdate({
      incidentId: "inc-auth-degrade",
      idempotencyKey: "incident-runtime-idempotency",
      message: "Different incident should conflict.",
      reason: "QA idempotent conflict",
      confirmed: true,
      status: "monitoring"
    });
    assert.equal(idempotencyConflict.status, "conflict");
    assert.equal(idempotencyConflict.error?.code, "idempotency_key_reused");
  });

  it("refreshes platform incident read models after same-process incident updates", async () => {
    const repository = seededPlatformRepository();
    const platform = new PlatformMonitoringService(repository);
    const incidents = new IncidentService(repository);

    const updated = await incidents.addIncidentUpdate({
      incidentId: "inc-webhook-retry",
      idempotencyKey: "incident-platform-refresh",
      message: "Webhook delivery has fully recovered.",
      reason: "QA platform refresh",
      confirmed: true,
      status: "resolved"
    });
    assert.equal(updated.status, "ok");

    const drilldown = await platform.fetchComponentDrilldown("cmp-webhooks");
    const snapshot = await platform.fetchPlatformSnapshot({ status: "degraded" });

    assert.ok((drilldown.data.incidents as Array<Record<string, unknown>>).some((incident) => incident.id === "inc-webhook-retry" && incident.status === "resolved"));
    assert.ok((snapshot.data.incidents as Array<Record<string, unknown>>).some((incident) => incident.id === "inc-webhook-retry" && incident.status === "resolved"));
  });

  it("previews, updates and internally tests feature flag rollout rules", async () => {
    const flags = new FeatureFlagService(seededPlatformRepository());

    const list = await flags.fetchFeatureFlags({ query: "ai", status: "on" });
    assert.equal(list.service, "featureFlagService");
    assert.equal(list.status, "ok");
    assert.equal(list.partial, true);
    assert.ok(list.data.items.some((flag) => flag.id === "flag-ai-replies"));
    assert.ok(list.data.tenants.some((tenant) => tenant.id === "tenant-northstar"));

    const missingReason = await flags.previewFlagChange({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const malformedReason = await flags.previewFlagChange({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: { text: "QA rollout preview" } as unknown as string
    });
    assert.equal(malformedReason.status, "invalid");
    assert.equal(malformedReason.error?.code, "reason_required");

    const preview = await flags.previewFlagChange({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: "QA rollout preview",
      tenantIds: ["tenant-northstar", "tenant-volga"]
    });
    assert.equal(preview.status, "ok");
    assert.equal(preview.data.confirmation.required, true);
    assert.equal(preview.data.confirmation.expectedText, "UPDATE ff-ai-replies");
    assert.equal(preview.data.blastRadius, 2);
    assert.equal(preview.data.selectedTenants.length, 2);

    const blocked = await flags.updateFeatureFlag({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: "QA rollout preview",
      confirmed: true,
      confirmationText: "wrong"
    });
    assert.equal(blocked.status, "invalid");
    assert.equal(blocked.error?.code, "confirmation_required");
    assert.equal(blocked.data.applied, false);
    assert.equal(blocked.data.auditEvent.result, "blocked");

    const invalidStatus = await flags.updateFeatureFlag({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "paused" as unknown as "on",
      reason: "QA rollout preview",
      confirmed: true,
      confirmationText: "UPDATE ff-ai-replies"
    });
    assert.equal(invalidStatus.status, "invalid");
    assert.equal(invalidStatus.error?.code, "flag_status_unsupported");

    const updated = await flags.updateFeatureFlag({
      flagId: "flag-ai-replies",
      nextRollout: 100,
      nextStatus: "on",
      reason: "QA rollout preview",
      confirmed: true,
      confirmationText: "UPDATE ff-ai-replies"
    });
    assert.equal(updated.status, "ok");
    assert.equal(updated.data.applied, true);
    assert.match(updated.data.auditEvent.id, /^evt_feature_flag_/);
    assert.equal(updated.data.outbox.queue, "feature-flag-rollout");

    const internalTest = await flags.runInternalFlagTest({
      flagId: "flag-ai-replies",
      tenantId: "tenant-northstar",
      segment: "business"
    });
    assert.equal(internalTest.status, "ok");
    assert.equal(internalTest.data.evaluation.eligible, true);
    assert.equal(internalTest.data.evaluation.variant, "assistant-v2");
  });

  it("persists feature flag rollout audit rows idempotently at runtime", async () => {
    const repository = seededPlatformRepository();
    const flags = new FeatureFlagService(repository);

    const first = await flags.updateFeatureFlag({
      flagId: "flag-billing-v2",
      idempotencyKey: "rollout-runtime-idempotency-001",
      nextRollout: 55,
      nextStatus: "gradual",
      reason: "QA rollout idempotency",
      confirmed: true
    } as Parameters<FeatureFlagService["updateFeatureFlag"]>[0]);
    const replay = await flags.updateFeatureFlag({
      flagId: "flag-billing-v2",
      idempotencyKey: "rollout-runtime-idempotency-001",
      nextRollout: 55,
      nextStatus: "gradual",
      reason: "QA rollout idempotency",
      confirmed: true
    } as Parameters<FeatureFlagService["updateFeatureFlag"]>[0]);
    const conflict = await flags.updateFeatureFlag({
      flagId: "flag-billing-v2",
      idempotencyKey: "rollout-runtime-idempotency-001",
      nextRollout: 75,
      nextStatus: "gradual",
      reason: "QA rollout idempotency",
      confirmed: true
    } as Parameters<FeatureFlagService["updateFeatureFlag"]>[0]);

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.platformAudit.id, first.data.platformAudit.id);
    assert.equal(replay.data.platformOutbox.id, first.data.platformOutbox.id);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "idempotency_key_reused");
    assert.deepEqual(repository.listPlatformAuditRows({ mutationKind: "rollout" }).map((row) => row.id), [
      first.data.platformAudit.id
    ]);
    assert.deepEqual(repository.listPlatformOutboxRows({ mutationKind: "rollout" }).map((row) => row.id), [
      first.data.platformOutbox.id
    ]);
  });

  it("wires feature flag update idempotency through the HTTP header", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/feature-flags/feature-flag.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@Headers\("idempotency-key"\)\s+idempotencyKey/);
    assert.match(source, /idempotencyKey:\s*idempotencyKey\s*\?\?\s*payload\.idempotencyKey/);
  });
});

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}
