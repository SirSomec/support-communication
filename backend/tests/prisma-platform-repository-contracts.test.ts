import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { FeatureFlagService } from "../apps/api-gateway/src/feature-flags/feature-flag.service.ts";
import { IncidentService } from "../apps/api-gateway/src/incidents/incident.service.ts";
import { configurePlatformRepository } from "../apps/api-gateway/src/platform/bootstrap.ts";
import { PlatformMonitoringService } from "../apps/api-gateway/src/platform/platform-monitoring.service.ts";
import {
  PlatformRepository,
  type PlatformAlertRoutingRule,
  type PlatformAuditRow,
  type PlatformHealthRollup,
  type PlatformOutboxRow,
  type PlatformTelemetrySample,
  type PrismaPlatformClient
} from "../apps/api-gateway/src/platform/platform.repository.ts";
import type { FeatureFlag, PlatformIncident } from "../apps/api-gateway/src/platform/platform.types.ts";
import type { PlatformFeatureFlagRule } from "../apps/api-gateway/src/feature-flags/feature-flag-rollout.engine.ts";
import { bootstrapPlatformState } from "../apps/api-gateway/src/platform/seed.ts";

describe("Prisma-backed platform repository contracts", () => {
  it("starts Prisma platform catalogs empty unless a seed is injected", async () => {
    const { client } = createFakePrismaPlatformClient();
    const repository = PlatformRepository.prisma({ client });

    assert.deepEqual(repository.listComponents(), []);
    assert.deepEqual(repository.listPlatformTenants(), []);
    assert.deepEqual(repository.listStaticMetrics(), []);
    assert.deepEqual(await repository.listIncidentsAsync(), []);
    assert.deepEqual(await repository.listFeatureFlagsAsync(), []);
  });

  it("fails closed when Prisma platform runtime delegates are incomplete", () => {
    const { client } = createFakePrismaPlatformClient();
    delete (client as { platformRuntimeRecord?: unknown }).platformRuntimeRecord;

    assert.throws(
      () => PlatformRepository.prisma({ client }),
      /prisma_platform_runtime_record_delegate_required/
    );
  });

  it("bootstraps the default platform repository from a Prisma client factory without touching JSON fallback", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "platform-prisma-bootstrap-"));
    const filePath = join(workspace, "platform-store.json");
    const { client } = createFakePrismaPlatformClient();

    try {
      const repository = configurePlatformRepository({
        DATABASE_URL: "postgresql://support:support@localhost:5432/support_communication",
        NODE_ENV: "staging",
        PLATFORM_REPOSITORY: "prisma",
        PLATFORM_STORE_FILE: filePath,
        PORT: "4100",
        SERVICE_NAME: "api-gateway"
      }, {
        prismaClientFactory: () => client,
        seed: bootstrapPlatformState()
      });

      await repository.saveTelemetrySampleAsync(telemetrySample({ id: "telemetry-prisma-bootstrap" }));
      const defaultRepository = PlatformRepository.default();
      const bootstrappedState = await defaultRepository.readStateAsync();

      assert.equal(repository, defaultRepository);
      assert.equal(existsSync(filePath), false);
      assert.deepEqual(bootstrappedState.telemetrySamples.map((sample) => sample.id), ["telemetry-prisma-bootstrap"]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
      PlatformRepository.clearDefault();
    }
  });

  it("persists mutable platform runtime state through Prisma delegates without JSON fallback", async () => {
    const { calls, client } = createFakePrismaPlatformClient();
    const first = PlatformRepository.prisma({ client, seed: bootstrapPlatformState() });

    assert.throws(
      () => first.readState(),
      /prisma_platform_async_required/
    );
    assert.ok(first.listComponents().some((component) => component.id === "cmp-webhooks"));

    await first.saveIncidentAsync(platformIncident({ id: "inc-prisma-runtime", status: "monitoring" }));
    const savedIncidentKey = await first.saveIncidentIdempotencyKeyAsync({
      fingerprint: "incident-fingerprint",
      key: "incident-key",
      result: { incident: { id: "inc-prisma-runtime" } }
    });
    const replayedIncidentKey = await first.saveIncidentIdempotencyKeyAsync({
      fingerprint: "changed",
      key: "incident-key",
      result: { incident: { id: "changed" } }
    });
    await first.saveFeatureFlagAsync(featureFlag({ id: "flag-prisma-runtime", key: "ff-prisma-runtime" }));
    await first.saveFeatureFlagOutboxAsync({
      id: "feature-flag-outbox-prisma",
      queue: "feature-flag-rollout",
      target: "ff-prisma-runtime"
    });
    await first.saveFeatureFlagRuleAsync(featureFlagRule({
      flagId: "flag-prisma-runtime",
      flagKey: "ff-prisma-runtime",
      id: "feature-flag-rule-prisma"
    }));
    await first.saveTelemetrySampleAsync(telemetrySample({ id: "telemetry-prisma-runtime" }));
    await first.saveHealthRollupAsync(healthRollup({ id: "health-rollup-prisma-runtime" }));
    await first.saveAlertRoutingRuleAsync(alertRoutingRule({ id: "route-prisma-runtime" }));
    await first.saveAlertAcknowledgementAsync({
      acknowledgedAt: "2026-07-03T11:07:00.000Z",
      auditEvent: { id: "evt-alert-prisma", immutable: true },
      componentId: "cmp-webhooks",
      reason: "Prisma alert acknowledgement",
      statusPageSync: { id: "status-page-prisma", queue: "status-page-sync" }
    });
    await first.saveIncidentCommunicationAttemptAsync({
      attemptId: "attempt-prisma-runtime",
      attemptedAt: "2026-07-03T11:08:00.000Z",
      descriptorId: "descriptor-prisma-runtime",
      idempotencyKey: "incident-communication-prisma-runtime",
      incidentId: "inc-prisma-runtime",
      port: "status-page",
      requestFingerprint: "incident-communication-fingerprint",
      status: "queued",
      traceId: "trc_platform_prisma_runtime",
      visibility: "customer-visible"
    });
    await first.saveIncidentCommunicationRetryAsync({
      attemptId: "attempt-prisma-runtime",
      attempts: 1,
      failedAt: "2026-07-03T11:09:00.000Z",
      incidentId: "inc-prisma-runtime",
      lastError: "provider timeout",
      nextAttemptAt: "2026-07-03T11:10:00.000Z",
      status: "retry_scheduled"
    });
    await first.saveIncidentCommunicationDeadLetterAsync({
      attemptId: "attempt-prisma-runtime",
      attempts: 3,
      deadLetteredAt: "2026-07-03T11:11:00.000Z",
      failedAt: "2026-07-03T11:11:00.000Z",
      incidentId: "inc-prisma-runtime",
      lastError: "provider timeout",
      status: "dead_lettered"
    });
    const savedAudit = await first.savePlatformAuditRowAsync(platformAuditRow({
      id: "platform-audit-prisma-runtime",
      idempotencyKey: "platform-audit:prisma-runtime"
    }));
    const replayedAudit = await first.savePlatformAuditRowAsync(platformAuditRow({
      id: "platform-audit-prisma-runtime",
      idempotencyKey: "platform-audit:prisma-runtime"
    }));
    await first.savePlatformOutboxRowAsync(platformOutboxRow({
      id: "platform-outbox-prisma-runtime",
      idempotencyKey: "platform-outbox:prisma-runtime"
    }));
    await first.updatePlatformOutboxRowStatusAsync("platform-outbox:prisma-runtime", "published", {
      externalId: "status-page-provider-prisma"
    });

    const second = PlatformRepository.prisma({ client, seed: bootstrapPlatformState() });
    const state = await second.readStateAsync();

    assert.equal(savedIncidentKey.result.incident.id, "inc-prisma-runtime");
    assert.equal(replayedIncidentKey.result.incident.id, "inc-prisma-runtime");
    assert.equal(savedAudit.id, replayedAudit.id);
    assert.equal((await second.findIncidentIdempotencyKeyAsync("incident-key"))?.fingerprint, "incident-fingerprint");
    assert.equal((await second.listIncidentsAsync()).some((incident) => incident.id === "inc-prisma-runtime"), true);
    assert.equal((await second.listFeatureFlagsAsync()).some((flag) => flag.id === "flag-prisma-runtime"), true);
    assert.deepEqual((await second.listFeatureFlagRulesAsync({ flagId: "flag-prisma-runtime" })).map((rule) => rule.id), [
      "feature-flag-rule-prisma"
    ]);
    assert.deepEqual((await second.listTelemetrySamplesAsync({ componentId: "cmp-webhooks" })).map((sample) => sample.id), [
      "telemetry-prisma-runtime"
    ]);
    assert.deepEqual((await second.listHealthRollupsAsync({ componentId: "cmp-webhooks" })).map((rollup) => rollup.id), [
      "health-rollup-prisma-runtime"
    ]);
    assert.deepEqual((await second.listAlertRoutingRulesAsync({ componentId: "cmp-webhooks" })).map((rule) => rule.id), [
      "route-prisma-runtime"
    ]);
    assert.equal((await second.findPlatformOutboxRowAsync("platform-outbox:prisma-runtime"))?.status, "published");
    assert.equal((await second.findPlatformOutboxRowAsync("platform-outbox:prisma-runtime"))?.payload.externalId, "status-page-provider-prisma");
    assert.equal(state.alertAcknowledgements[0]?.componentId, "cmp-webhooks");
    assert.equal(state.incidentCommunicationAttempts[0]?.attemptId, "attempt-prisma-runtime");
    assert.equal(state.incidentCommunicationRetries[0]?.attemptId, "attempt-prisma-runtime");
    assert.equal(state.incidentCommunicationDeadLetters[0]?.attemptId, "attempt-prisma-runtime");
    assert.equal(calls.runtimeUpserts.length >= 7, true);
    assert.equal(calls.telemetryUpserts.length, 1);
    assert.equal(calls.healthUpserts.length, 1);
    assert.equal(calls.alertRoutingUpserts.length, 1);
    assert.equal(calls.featureFlagRuleUpserts.length, 1);
    assert.equal(calls.auditUpserts.length, 1);
    assert.equal(calls.outboxUpserts.length, 2);
  });

  it("drives platform services through Prisma-backed repositories without sync JSON fallback", async () => {
    const { calls, client } = createFakePrismaPlatformClient();
    const repository = PlatformRepository.prisma({ client, seed: bootstrapPlatformState() });
    const platform = new PlatformMonitoringService(repository);
    const incidents = new IncidentService(repository);
    const flags = new FeatureFlagService(repository);

    const sample = await platform.ingestTelemetrySample({
      componentId: "cmp-webhooks",
      id: "telemetry-prisma-service",
      metricKey: "latency_p95_ms",
      sampledAt: "2026-07-03T12:00:00.000Z",
      source: "service-test",
      tags: { route: "/api/v1/platform" },
      tenantId: "tenant-volga",
      unit: "ms",
      value: 456
    });
    const incidentUpdate = await incidents.addIncidentUpdate({
      confirmed: true,
      idempotencyKey: "incident-prisma-service",
      incidentId: "inc-webhook-retry",
      message: "Webhook delivery delay is being monitored through Prisma.",
      reason: "Prisma service test",
      status: "monitoring"
    });
    const flagUpdate = await flags.updateFeatureFlag({
      confirmed: true,
      flagId: "flag-billing-v2",
      idempotencyKey: "rollout-prisma-service",
      nextRollout: 60,
      nextStatus: "gradual",
      reason: "Prisma service rollout"
    });
    const acknowledged = await platform.acknowledgeComponentAlert({
      componentId: "cmp-webhooks",
      confirmed: true,
      idempotencyKey: "ack-prisma-service",
      reason: "Prisma service alert"
    });

    assert.equal(sample.status, "ok");
    assert.equal(incidentUpdate.status, "ok");
    assert.equal(flagUpdate.status, "ok");
    assert.equal(acknowledged.status, "ok");
    assert.equal((await repository.listTelemetrySamplesAsync({ componentId: "cmp-webhooks" })).some((item) => item.id === "telemetry-prisma-service"), true);
    assert.equal((await repository.listIncidentsAsync()).find((item) => item.id === "inc-webhook-retry")?.status, "monitoring");
    assert.equal((await repository.listFeatureFlagsAsync()).find((item) => item.id === "flag-billing-v2")?.rollout, 60);
    assert.equal(calls.runtimeUpserts.length >= 4, true);
    assert.equal(calls.auditUpserts.length >= 3, true);
    assert.equal(calls.outboxUpserts.length >= 3, true);
  });
});

function createFakePrismaPlatformClient(): { calls: FakePlatformCalls; client: PrismaPlatformClient } {
  const runtimeRows = new Map<string, FakeRuntimeRow>();
  const telemetryRows = new Map<string, FakeTelemetryRow>();
  const healthRows = new Map<string, FakeHealthRow>();
  const alertRoutingRows = new Map<string, FakeAlertRoutingRow>();
  const featureFlagRuleRows = new Map<string, FakeFeatureFlagRuleRow>();
  const auditRows = new Map<string, FakeAuditRow>();
  const outboxRows = new Map<string, FakeOutboxRow>();
  const calls: FakePlatformCalls = {
    alertRoutingUpserts: [],
    auditUpserts: [],
    featureFlagRuleUpserts: [],
    healthUpserts: [],
    outboxUpserts: [],
    runtimeUpserts: [],
    telemetryUpserts: []
  };

  return {
    calls,
    client: {
      featureFlagRule: {
        findMany(input: { orderBy?: { updatedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(featureFlagRuleRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("updatedAt")));
        },
        upsert(input: { create: FakeFeatureFlagRuleRow; update: Partial<FakeFeatureFlagRuleRow>; where: { id: string } }) {
          calls.featureFlagRuleUpserts.push(input);
          return Promise.resolve(upsertById(featureFlagRuleRows, input));
        }
      },
      platformAlertRoutingRule: {
        findMany(input: { orderBy?: { updatedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(alertRoutingRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("updatedAt")));
        },
        upsert(input: { create: FakeAlertRoutingRow; update: Partial<FakeAlertRoutingRow>; where: { id: string } }) {
          calls.alertRoutingUpserts.push(input);
          return Promise.resolve(upsertById(alertRoutingRows, input));
        }
      },
      platformAuditRow: {
        findMany(input: { orderBy?: { createdAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(auditRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("createdAt")));
        },
        findUnique(input: { where: { id?: string; idempotencyKey?: string } }) {
          return Promise.resolve(findByIdOrIdempotencyKey(auditRows, input.where));
        },
        upsert(input: { create: FakeAuditRow; update: Partial<FakeAuditRow>; where: { idempotencyKey: string } }) {
          calls.auditUpserts.push(input);
          const current = findByIdOrIdempotencyKey(auditRows, input.where);
          if (current) {
            return Promise.resolve(current);
          }
          auditRows.set(input.create.id, input.create);
          return Promise.resolve(input.create);
        }
      },
      platformHealthRollup: {
        findMany(input: { orderBy?: { windowEnd: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(healthRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("windowEnd")));
        },
        upsert(input: { create: FakeHealthRow; update: Partial<FakeHealthRow>; where: { id: string } }) {
          calls.healthUpserts.push(input);
          return Promise.resolve(upsertById(healthRows, input));
        }
      },
      platformOutboxRow: {
        findMany(input: { orderBy?: { createdAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(outboxRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("createdAt")));
        },
        findUnique(input: { where: { id?: string; idempotencyKey?: string } }) {
          return Promise.resolve(findByIdOrIdempotencyKey(outboxRows, input.where));
        },
        upsert(input: { create: FakeOutboxRow; update: Partial<FakeOutboxRow>; where: { idempotencyKey: string } }) {
          calls.outboxUpserts.push(input);
          const current = findByIdOrIdempotencyKey(outboxRows, input.where);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          outboxRows.set(next.id, next);
          return Promise.resolve(next);
        }
      },
      platformRuntimeRecord: {
        findMany(input: { orderBy?: { updatedAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(runtimeRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("updatedAt")));
        },
        findUnique(input: { where: { collection_entityKey: { collection: string; entityKey: string } } }) {
          return Promise.resolve(runtimeRows.get(runtimeKey(
            input.where.collection_entityKey.collection,
            input.where.collection_entityKey.entityKey
          )) ?? null);
        },
        upsert(input: {
          create: FakeRuntimeRow;
          update: Partial<FakeRuntimeRow>;
          where: { collection_entityKey: { collection: string; entityKey: string } };
        }) {
          calls.runtimeUpserts.push(input);
          const key = runtimeKey(input.where.collection_entityKey.collection, input.where.collection_entityKey.entityKey);
          const current = runtimeRows.get(key);
          const next = current
            ? { ...current, ...input.update, id: current.id, collection: current.collection, entityKey: current.entityKey, createdAt: current.createdAt, updatedAt: new Date() }
            : input.create;
          runtimeRows.set(key, next);
          return Promise.resolve(next);
        }
      },
      platformTelemetrySample: {
        findMany(input: { orderBy?: { sampledAt: "desc" }; where?: Record<string, unknown> } = {}) {
          return Promise.resolve(Array.from(telemetryRows.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort(sortByDateDesc("sampledAt")));
        },
        upsert(input: { create: FakeTelemetryRow; update: Partial<FakeTelemetryRow>; where: { id: string } }) {
          calls.telemetryUpserts.push(input);
          return Promise.resolve(upsertById(telemetryRows, input));
        }
      }
    }
  };
}

function telemetrySample(overrides: Partial<PlatformTelemetrySample> = {}): PlatformTelemetrySample {
  return {
    componentId: "cmp-webhooks",
    id: "telemetry-prisma",
    metricKey: "latency_p95_ms",
    sampledAt: "2026-07-03T11:00:00.000Z",
    source: "synthetic-probe",
    tags: { route: "/api/v1/platform" },
    tenantId: "tenant-volga",
    unit: "ms",
    value: 123,
    ...overrides
  };
}

function healthRollup(overrides: Partial<PlatformHealthRollup> = {}): PlatformHealthRollup {
  return {
    availability: 99.95,
    componentId: "cmp-webhooks",
    errorRate: 0.01,
    generatedAt: "2026-07-03T11:01:00.000Z",
    id: "health-rollup-prisma",
    incidentIds: ["inc-prisma-runtime"],
    latencyP95Ms: 321,
    sampleCount: 5,
    status: "degraded",
    windowEnd: "2026-07-03T11:00:00.000Z",
    windowStart: "2026-07-03T10:55:00.000Z",
    ...overrides
  };
}

function alertRoutingRule(overrides: Partial<PlatformAlertRoutingRule> = {}): PlatformAlertRoutingRule {
  return {
    componentIds: ["cmp-webhooks"],
    createdAt: "2026-07-03T11:02:00.000Z",
    destination: {
      channel: "slack",
      target: "#platform-alerts"
    },
    enabled: true,
    id: "route-prisma",
    severities: ["sev2"],
    statuses: ["partial_outage"],
    updatedAt: "2026-07-03T11:02:00.000Z",
    ...overrides
  };
}

function platformIncident(overrides: Partial<PlatformIncident> = {}): PlatformIncident {
  return {
    affectedTenantIds: ["tenant-volga"],
    componentId: "cmp-webhooks",
    customerMessage: "Webhook delivery delay is being monitored.",
    id: "inc-prisma",
    impact: "Outbound webhooks may be delayed.",
    owner: "Platform",
    severity: "sev2",
    startedAt: "2026-07-03T11:03:00.000Z",
    status: "investigating",
    title: "Webhook delivery delays",
    updatedAt: "2026-07-03T11:03:00.000Z",
    updates: [{ at: "11:03", author: "Platform", text: "Investigation started." }],
    ...overrides
  };
}

function featureFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  return {
    enabledTenantIds: ["tenant-volga"],
    environment: "production",
    id: "flag-prisma",
    key: "ff-prisma",
    killSwitch: false,
    name: "Prisma flag",
    owner: "Platform",
    rollout: 50,
    scope: "tenant",
    segments: ["business"],
    status: "gradual",
    updatedAt: "2026-07-03T11:04:00.000Z",
    variants: [{ id: "control", weight: 100 }],
    ...overrides
  };
}

function featureFlagRule(overrides: Partial<PlatformFeatureFlagRule> = {}): PlatformFeatureFlagRule {
  return {
    bucketSalt: "flag-prisma-runtime",
    enabledTenantIds: ["tenant-volga"],
    flagId: "flag-prisma",
    flagKey: "ff-prisma",
    id: "feature-flag-rule-prisma",
    rollout: 50,
    segments: ["business"],
    status: "gradual",
    targeting: "tenant",
    updatedAt: "2026-07-03T11:05:00.000Z",
    variants: [{ id: "control", weight: 100 }],
    ...overrides
  };
}

function platformAuditRow(overrides: Partial<PlatformAuditRow> = {}): PlatformAuditRow {
  return {
    action: "platform.alert.acknowledge",
    actor: "svc-admin",
    actorName: "Service Admin",
    createdAt: "2026-07-03T11:06:00.000Z",
    fingerprint: "platform-audit-fingerprint",
    id: "platform-audit-prisma",
    idempotencyKey: "platform-audit:prisma",
    immutable: true,
    mutationKind: "alert",
    payload: { componentId: "cmp-webhooks" },
    reason: "Prisma audit persistence",
    result: "queued",
    target: "cmp-webhooks",
    traceId: "trc_platform_prisma",
    ...overrides
  };
}

function platformOutboxRow(overrides: Partial<PlatformOutboxRow> = {}): PlatformOutboxRow {
  return {
    aggregateId: "cmp-webhooks",
    aggregateType: "platform_component",
    createdAt: "2026-07-03T11:06:00.000Z",
    fingerprint: "platform-outbox-fingerprint",
    id: "platform-outbox-prisma",
    idempotencyKey: "platform-outbox:prisma",
    mutationKind: "alert",
    payload: { componentId: "cmp-webhooks" },
    queue: "status-page-sync",
    status: "pending",
    target: "cmp-webhooks",
    traceId: "trc_platform_prisma",
    type: "platform.alert.status_page.requested",
    ...overrides
  };
}

interface FakePlatformCalls {
  alertRoutingUpserts: unknown[];
  auditUpserts: unknown[];
  featureFlagRuleUpserts: unknown[];
  healthUpserts: unknown[];
  outboxUpserts: unknown[];
  runtimeUpserts: unknown[];
  telemetryUpserts: unknown[];
}

interface FakeRuntimeRow {
  collection: string;
  createdAt: Date;
  entityKey: string;
  filterKey: string | null;
  id: string;
  record: unknown;
  updatedAt: Date;
}

interface FakeTelemetryRow {
  componentId: string;
  createdAt: Date;
  id: string;
  metricKey: string;
  sampledAt: Date;
  source: string;
  tags: unknown;
  tenantId: string | null;
  unit: string;
  value: number;
}

interface FakeHealthRow {
  availability: number;
  componentId: string;
  createdAt: Date;
  errorRate: number;
  generatedAt: Date;
  id: string;
  incidentIds: unknown;
  latencyP95Ms: number;
  sampleCount: number;
  status: string;
  windowEnd: Date;
  windowStart: Date;
}

interface FakeAlertRoutingRow {
  componentIds: unknown;
  createdAt: Date;
  destinationChannel: string;
  destinationTarget: string;
  enabled: boolean;
  id: string;
  severities: unknown;
  statuses: unknown;
  updatedAt: Date;
}

interface FakeFeatureFlagRuleRow {
  bucketSalt: string;
  createdAt: Date;
  enabledTenantIds: unknown;
  flagId: string;
  flagKey: string;
  id: string;
  rollout: number;
  segments: unknown;
  status: string;
  targeting: string;
  updatedAt: Date;
  variants: unknown;
}

interface FakeAuditRow {
  action: string;
  actor: string;
  actorName: string;
  createdAt: Date;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  immutable: boolean;
  mutationKind: string;
  payload: unknown;
  reason: string;
  result: string;
  target: string;
  traceId: string;
}

interface FakeOutboxRow {
  aggregateId: string;
  aggregateType: string;
  createdAt: Date;
  fingerprint: string;
  id: string;
  idempotencyKey: string;
  mutationKind: string;
  payload: unknown;
  queue: string;
  status: string;
  target: string;
  traceId: string;
  type: string;
}

function runtimeKey(collection: string, entityKey: string): string {
  return `${collection}:${entityKey}`;
}

function upsertById<T extends { createdAt: Date; id: string }>(
  rows: Map<string, T>,
  input: { create: T; update: Partial<T>; where: { id: string } }
): T {
  const current = rows.get(input.where.id);
  const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
  rows.set(input.where.id, next as T);
  return next as T;
}

function findByIdOrIdempotencyKey<T extends { id: string; idempotencyKey: string }>(
  rows: Map<string, T>,
  where: { id?: string; idempotencyKey?: string }
): T | null {
  const values = Array.from(rows.values());
  return values.find((row) =>
    (where.id !== undefined && row.id === where.id) ||
    (where.idempotencyKey !== undefined && row.idempotencyKey === where.idempotencyKey)
  ) ?? null;
}

function sortByDateDesc<T extends Record<string, unknown>>(field: string): (left: T, right: T) => number {
  return (left, right) => {
    const leftValue = left[field];
    const rightValue = right[field];
    const leftTime = leftValue instanceof Date ? leftValue.getTime() : 0;
    const rightTime = rightValue instanceof Date ? rightValue.getTime() : 0;
    return rightTime - leftTime;
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      if ("in" in expected) {
        return (expected as { in: unknown[] }).in.includes(actual);
      }
      if ("gte" in expected || "lte" in expected) {
        const actualTime = actual instanceof Date ? actual.getTime() : NaN;
        const gte = (expected as { gte?: unknown }).gte;
        const lte = (expected as { lte?: unknown }).lte;
        return (gte === undefined || (gte instanceof Date && actualTime >= gte.getTime())) &&
          (lte === undefined || (lte instanceof Date && actualTime <= lte.getTime()));
      }
    }

    return actual === expected;
  });
}
