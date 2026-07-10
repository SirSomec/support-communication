import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import type { PlatformComponent, PlatformIncident, PlatformMetric, PlatformTenant } from "./platform.types.js";
import { PlatformRepository, type PlatformHealthRollup, type PlatformTelemetrySample } from "./platform.repository.js";
import {
  makeEphemeralPlatformMutationIdempotencyKey,
  persistPlatformAlertMutationAsync
} from "./platform-audit-outbox.js";

const PLATFORM_SERVICE = "platformMonitoringService";
const HEALTH_ROLLUP_RETENTION_DAYS = 90;
const HEALTH_ROLLUP_RETENTION_POLICY = "platform-health-rollups-90d";
const TELEMETRY_SAMPLE_RETENTION_DAYS = 30;
const TELEMETRY_SAMPLE_RETENTION_POLICY = "platform-telemetry-samples-30d";

interface PlatformFilters {
  region?: string;
  status?: string;
}

interface AcknowledgePayload {
  actor?: ServiceAdminActor;
  componentId?: string;
  confirmed?: boolean;
  idempotencyKey?: string;
  reason?: string;
}

interface IngestTelemetrySamplePayload {
  componentId?: string;
  id?: string;
  metricKey?: string;
  sampledAt?: string;
  source?: string;
  tags?: Record<string, unknown>;
  tenantId?: string | null;
  unit?: string;
  value?: number;
}

interface WriteHealthRollupPayload {
  availability?: number;
  componentId?: string;
  errorRate?: number;
  generatedAt?: string;
  id?: string;
  incidentIds?: string[];
  latencyP95Ms?: number;
  sampleCount?: number;
  status?: string;
  windowEnd?: string;
  windowStart?: string;
}

interface SaveAlertRoutingRulePayload {
  componentIds?: string[];
  destination?: {
    channel?: string;
    target?: string;
  };
  enabled?: boolean;
  ruleId?: string;
  severities?: string[];
  statuses?: string[];
}

export class PlatformMonitoringService {
  constructor(private readonly platformRepository = PlatformRepository.default()) {}

  async fetchPlatformSnapshot(filters: PlatformFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const components = (await this.platformRepository.listComponentsAsync()).filter((component) => {
      const statusMatches = componentStatusMatches(component, filters.status);
      const regionMatches = !filters.region || filters.region === "all" || component.region === filters.region || component.region === "global";
      return statusMatches && regionMatches;
    });
    const componentIds = new Set(components.map((component) => component.id));
    const incidents = (await this.platformRepository.listIncidentsAsync()).filter((incident) => componentIds.has(incident.componentId));
    const healthRollups = await this.currentSnapshotHealthRollups(componentIds);
    const metrics = await this.currentSnapshotMetrics(componentIds);

    const openIncidents = incidents.filter((incident) => incident.status !== "resolved");

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "fetchPlatformSnapshot",
      traceId: platformTraceId("fetchPlatformSnapshot"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        components: clone(components),
        healthRollups,
        incidents: clone(incidents),
        metrics: clone(metrics),
        summary: {
          affectedTenants: new Set(incidents.flatMap((incident) => incident.affectedTenantIds)).size,
          degraded: components.filter((component) => component.status !== "operational").length,
          globalUptime: averageUptime(components),
          openIncidents: openIncidents.length,
          sloBurnRate: 1.42
        }
      }
    });
  }

  async fetchComponentDrilldown(componentId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const component = await this.findComponent(componentId);

    if (!component) {
      return notFoundEnvelope("fetchComponentDrilldown", "component_not_found", `Component ${componentId} was not found.`, { componentId });
    }

    const incidents = (await this.platformRepository.listIncidentsAsync()).filter((incident) => incident.componentId === component.id);
    const affectedTenants = (await this.platformRepository.listPlatformTenantsAsync()).filter((tenant) => incidents.some((incident) => incident.affectedTenantIds.includes(tenant.id)));

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "fetchComponentDrilldown",
      traceId: platformTraceId("fetchComponentDrilldown"),
      meta: apiMeta({ componentId }),
      data: {
        affectedTenants: clone(affectedTenants),
        component: clone(component),
        incidents: clone(incidents),
        metrics: clone((await this.platformRepository.listStaticMetricsAsync()).filter((metric) => metric.componentId === component.id)),
        runbooks: [
          `${component.ownerTeam} on-call escalation`,
          "Customer status note review",
          "Audit stream integrity check"
        ]
      }
    });
  }

  async saveAlertRoutingRule(payload: SaveAlertRoutingRulePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    if (!isNonEmptyString(request.destination?.channel) || !isNonEmptyString(request.destination?.target)) {
      return invalidEnvelope("saveAlertRoutingRule", "alert_route_destination_required", "Alert routing destination channel and target are required.", {
        destination: request.destination ?? null
      });
    }

    const id = isNonEmptyString(request.ruleId) ? request.ruleId.trim() : alertRoutingRuleId();
    const existing = (await this.platformRepository.listAlertRoutingRulesAsync()).find((rule) => rule.id === id);
    const now = new Date().toISOString();
    const rule = await this.platformRepository.saveAlertRoutingRuleAsync({
      componentIds: normalizeStringList(request.componentIds),
      createdAt: existing?.createdAt ?? now,
      destination: {
        channel: request.destination.channel.trim(),
        target: request.destination.target.trim()
      },
      enabled: request.enabled ?? true,
      id,
      severities: normalizeStringList(request.severities),
      statuses: normalizeStringList(request.statuses),
      updatedAt: now
    });

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "saveAlertRoutingRule",
      traceId: platformTraceId("saveAlertRoutingRule"),
      meta: apiMeta({ ruleId: rule.id }),
      data: {
        rule
      }
    });
  }

  async ingestTelemetrySample(payload: IngestTelemetrySamplePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const component = await this.resolveWritableComponent(request.componentId ?? "");

    if (!component) {
      return invalidEnvelope("ingestTelemetrySample", "component_required", "A known platform component is required.", {
        componentId: request.componentId ?? null
      });
    }

    if (!isNonEmptyString(request.metricKey) || !isNonEmptyString(request.source) || !isNonEmptyString(request.unit)) {
      return invalidEnvelope("ingestTelemetrySample", "telemetry_metadata_required", "Metric key, source and unit are required.", {
        componentId: component.id,
        metricKey: request.metricKey ?? null,
        source: request.source ?? null,
        unit: request.unit ?? null
      });
    }

    if (!isFiniteNumber(request.value)) {
      return invalidEnvelope("ingestTelemetrySample", "telemetry_value_required", "A finite numeric telemetry value is required.", {
        componentId: component.id,
        metricKey: request.metricKey
      });
    }

    if (request.tags !== undefined && !isPlainRecord(request.tags)) {
      return invalidEnvelope("ingestTelemetrySample", "telemetry_tags_invalid", "Telemetry tags must be a JSON object when provided.", {
        componentId: component.id,
        metricKey: request.metricKey
      });
    }

    const sampledAt = parseIsoTimestamp(request.sampledAt);
    if (!sampledAt) {
      return invalidEnvelope("ingestTelemetrySample", "sampled_at_required", "A valid sampledAt timestamp is required.", {
        componentId: component.id,
        sampledAt: request.sampledAt ?? null
      });
    }

    if (addDays(sampledAt, TELEMETRY_SAMPLE_RETENTION_DAYS).getTime() <= Date.now()) {
      return invalidEnvelope("ingestTelemetrySample", "telemetry_retention_window_expired", "Telemetry samples outside the retention window are rejected.", {
        componentId: component.id,
        metricKey: request.metricKey,
        sampledAt: sampledAt.toISOString()
      });
    }

    const sample = await this.platformRepository.saveTelemetrySampleAsync({
      componentId: component.id,
      id: isNonEmptyString(request.id) ? request.id.trim() : telemetrySampleId(),
      metricKey: request.metricKey.trim(),
      sampledAt: sampledAt.toISOString(),
      source: request.source.trim(),
      tags: isPlainRecord(request.tags) ? clone(request.tags) : {},
      tenantId: isNonEmptyString(request.tenantId) ? request.tenantId.trim() : null,
      unit: request.unit.trim(),
      value: request.value
    });

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "ingestTelemetrySample",
      traceId: platformTraceId("ingestTelemetrySample"),
      meta: apiMeta({ componentId: component.id }),
      data: {
        retention: telemetrySampleRetention(sample),
        sample
      }
    });
  }

  async writeHealthRollup(payload: WriteHealthRollupPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const component = await this.resolveWritableComponent(request.componentId ?? "");

    if (!component) {
      return invalidEnvelope("writeHealthRollup", "component_required", "A known platform component is required.", {
        componentId: request.componentId ?? null
      });
    }

    if (!isNonEmptyString(request.status)) {
      return invalidEnvelope("writeHealthRollup", "health_status_required", "A health rollup status is required.", {
        componentId: component.id,
        status: request.status ?? null
      });
    }

    if (
      !isFiniteNumber(request.availability) ||
      !isFiniteNumber(request.errorRate) ||
      !isNonNegativeInteger(request.latencyP95Ms) ||
      !isNonNegativeInteger(request.sampleCount)
    ) {
      return invalidEnvelope("writeHealthRollup", "health_metrics_required", "Finite health rollup metrics are required.", {
        componentId: component.id,
        status: request.status
      });
    }

    const windowStart = parseIsoTimestamp(request.windowStart);
    const windowEnd = parseIsoTimestamp(request.windowEnd);
    const generatedAt = parseIsoTimestamp(request.generatedAt);
    if (!windowStart || !windowEnd || !generatedAt) {
      return invalidEnvelope("writeHealthRollup", "health_window_required", "Valid windowStart, windowEnd and generatedAt timestamps are required.", {
        componentId: component.id,
        generatedAt: request.generatedAt ?? null,
        windowEnd: request.windowEnd ?? null,
        windowStart: request.windowStart ?? null
      });
    }

    if (addDays(windowEnd, HEALTH_ROLLUP_RETENTION_DAYS).getTime() <= Date.now()) {
      return invalidEnvelope("writeHealthRollup", "health_rollup_retention_window_expired", "Health rollups outside the retention window are rejected.", {
        componentId: component.id,
        status: request.status,
        windowEnd: windowEnd.toISOString()
      });
    }

    const rollup = await this.platformRepository.saveHealthRollupAsync({
      availability: request.availability,
      componentId: component.id,
      errorRate: request.errorRate,
      generatedAt: generatedAt.toISOString(),
      id: isNonEmptyString(request.id) ? request.id.trim() : healthRollupId(),
      incidentIds: Array.isArray(request.incidentIds) ? request.incidentIds.filter(isNonEmptyString).map((item) => item.trim()) : [],
      latencyP95Ms: request.latencyP95Ms,
      sampleCount: request.sampleCount,
      status: request.status.trim(),
      windowEnd: windowEnd.toISOString(),
      windowStart: windowStart.toISOString()
    });

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "writeHealthRollup",
      traceId: platformTraceId("writeHealthRollup"),
      meta: apiMeta({ componentId: component.id }),
      data: {
        retention: healthRollupRetention(rollup),
        rollup
      }
    });
  }

  async acknowledgeComponentAlert(payload: AcknowledgePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const component = await this.findComponent(request.componentId ?? "");

    if (!component) {
      return notFoundEnvelope("acknowledgeComponentAlert", "component_not_found", `Component ${request.componentId ?? "(empty)"} was not found.`, {
        componentId: request.componentId ?? null
      });
    }

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope("acknowledgeComponentAlert", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        componentId: component.id,
        reason: request.reason ?? null
      });
    }

    if (!request.confirmed) {
      return invalidEnvelope("acknowledgeComponentAlert", "confirmation_required", "Explicit confirmation is required to acknowledge platform alerts.", {
        componentId: component.id,
        confirmation: { required: true },
        reason: request.reason
      });
    }

    const traceId = platformTraceId("acknowledgeComponentAlert");
    const idempotencyKey = isNonEmptyString(request.idempotencyKey)
      ? request.idempotencyKey.trim()
      : makeEphemeralPlatformMutationIdempotencyKey(`alert-ack-${component.id}`);
    let mutationPersistence: Awaited<ReturnType<typeof persistPlatformAlertMutationAsync>>;
    try {
      mutationPersistence = await persistPlatformAlertMutationAsync({
        actor: request.actor,
        componentId: component.id,
        idempotencyKey,
        reason: String(request.reason).trim(),
        repository: this.platformRepository,
        traceId
      });
    } catch (error) {
      if (isPlatformIdempotencyConflict(error)) {
        return conflictEnvelope("acknowledgeComponentAlert", "idempotency_key_reused", "Idempotency key was already used for a different alert acknowledgement.", {
          componentId: component.id,
          idempotencyKey
        });
      }

      throw error;
    }
    const severity = (await this.platformRepository.listIncidentsAsync()).find((incident) => incident.componentId === component.id && incident.status !== "resolved")?.severity ?? component.status;
    const notificationOutboxRows = await Promise.all((await this.platformRepository
      .listAlertRoutingRulesAsync({
        componentId: component.id,
        enabled: true,
        severity,
        status: component.status
      })
    ).map((rule) => this.platformRepository.savePlatformOutboxRowAsync({
        aggregateId: component.id,
        aggregateType: "platform_component",
        createdAt: mutationPersistence.audit.createdAt,
        fingerprint: fingerprintPlatformAlertNotification({
          componentId: component.id,
          routeId: rule.id
        }),
        id: platformAlertNotificationOutboxId(idempotencyKey, rule.id),
        idempotencyKey: platformAlertNotificationOutboxIdempotencyKey(idempotencyKey, rule.id),
        mutationKind: "alert",
        payload: {
          componentId: component.id,
          componentStatus: component.status,
          destinationChannel: rule.destination.channel,
          destinationTarget: rule.destination.target,
          routeId: rule.id,
          severity
        },
        queue: "platform-notification",
        status: "pending",
        target: component.id,
        traceId,
        type: "platform.alert.notification.requested"
      })));
    const acknowledgement = await this.platformRepository.saveAlertAcknowledgementAsync({
      acknowledgedAt: new Date().toISOString(),
      auditEvent: auditEvent("platform.alert.acknowledge", component.id, request.reason, request.actor),
      componentId: component.id,
      reason: normalizeReason(request.reason),
      statusPageSync: statusPageSync("component-alert", component.id)
    });

    return createEnvelope({
      service: PLATFORM_SERVICE,
      operation: "acknowledgeComponentAlert",
      traceId,
      meta: apiMeta({ componentId: component.id }),
      data: {
        ...acknowledgement,
        platformAudit: mutationPersistence.audit,
        platformOutbox: mutationPersistence.outbox,
        notificationOutboxRows
      }
    });
  }

  private async findComponent(componentId: string): Promise<PlatformComponent | undefined> {
    return (await this.platformRepository.listComponentsAsync()).find((component) => component.id === componentId);
  }

  private async resolveWritableComponent(componentId: string): Promise<PlatformComponent | undefined> {
    const normalized = String(componentId ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    return (await this.findComponent(normalized)) ?? syntheticPlatformComponent(normalized);
  }

  private async currentSnapshotMetrics(componentIds: Set<string>): Promise<Array<Record<string, unknown>>> {
    const fixtureMetrics = (await this.platformRepository.listStaticMetricsAsync()).filter((metric) => componentIds.has(metric.componentId));
    const telemetryMetrics = (await this.platformRepository
      .listTelemetrySamplesAsync())
      .filter((sample) => componentIds.has(sample.componentId))
      .map(telemetrySampleMetric);

    return clone([...fixtureMetrics, ...telemetryMetrics] as Array<Record<string, unknown>>);
  }

  private async currentSnapshotHealthRollups(componentIds: Set<string>): Promise<Array<Record<string, unknown>>> {
    return (await this.platformRepository
      .listHealthRollupsAsync())
      .filter((rollup) => componentIds.has(rollup.componentId))
      .map((rollup) => ({ ...clone(rollup) }));
  }
}

function syntheticPlatformComponent(componentId: string): PlatformComponent {
  return {
    dependencies: [],
    errorRate: 0,
    id: componentId,
    latencyMs: 0,
    name: componentId,
    ownerTeam: "platform",
    recentEvents: [],
    region: "global",
    signals: [],
    status: "operational",
    tenantImpact: 0,
    uptime: 100
  };
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(action: string, target: string, reason: string | undefined, actor: ServiceAdminActor | undefined): Record<string, unknown> {
  return {
    id: makeAuditId("platform_component"),
    action,
    actor: actor?.id ?? "service-admin",
    actorName: actor?.name ?? "Service Admin",
    immutable: true,
    reason: normalizeReason(reason),
    target
  };
}

function averageUptime(components: PlatformComponent[]): number {
  if (components.length === 0) {
    return 0;
  }

  return Number((components.reduce((sum, component) => sum + component.uptime, 0) / components.length).toFixed(2));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function alertRoutingRuleId(): string {
  return `alert-route-${randomUUID()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function componentStatusMatches(component: PlatformComponent, status: string | undefined): boolean {
  if (!status || status === "all") {
    return true;
  }

  if (status === "degraded") {
    return component.status !== "operational";
  }

  return component.status === status;
}

function hasAuditReason(reason: unknown): boolean {
  return typeof reason === "string" && reason.trim().length >= 8;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: PLATFORM_SERVICE,
    operation,
    traceId: platformTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function isPlatformIdempotencyConflict(error: unknown): boolean {
  return error instanceof Error && [
    "platform_audit_idempotency_conflict",
    "platform_outbox_idempotency_conflict"
  ].some((code) => error.message.includes(code));
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: PLATFORM_SERVICE,
    operation,
    traceId: platformTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function fingerprintPlatformAlertNotification(payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, scope: "alert-notification-outbox" }))
    .digest("hex");
}

function normalizeReason(reason: string | undefined): string | null {
  return typeof reason === "string" ? reason.trim() : null;
}

function normalizeStringList(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter(isNonEmptyString).map((value) => value.trim())
    : [];
}

function parseIsoTimestamp(value: unknown): Date | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function overlayById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  const overrides = new Map(overlay.map((item) => [item.id, item]));
  const merged = base.map((item) => overrides.get(item.id) ?? item);
  const extra = overlay.filter((item) => !base.some((baseItem) => baseItem.id === item.id));
  return clone([...extra, ...merged]);
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: PLATFORM_SERVICE,
    operation,
    traceId: platformTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function platformTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(PLATFORM_SERVICE, operation);
}

function healthRollupId(): string {
  return `health-rollup-${randomUUID()}`;
}

function healthRollupRetention(rollup: PlatformHealthRollup): Record<string, unknown> {
  return {
    expiresAt: addDays(new Date(rollup.windowEnd), HEALTH_ROLLUP_RETENTION_DAYS).toISOString(),
    policy: HEALTH_ROLLUP_RETENTION_POLICY,
    retentionDays: HEALTH_ROLLUP_RETENTION_DAYS
  };
}

function telemetrySampleId(): string {
  return `telemetry-sample-${randomUUID()}`;
}

function telemetrySampleMetric(sample: PlatformTelemetrySample): Record<string, unknown> {
  return {
    componentId: sample.componentId,
    id: sample.id,
    label: sample.metricKey,
    metricKey: sample.metricKey,
    sampledAt: sample.sampledAt,
    source: sample.source,
    tags: clone(sample.tags),
    tenantId: sample.tenantId,
    tone: "ok",
    unit: sample.unit,
    value: sample.value
  };
}

function telemetrySampleRetention(sample: PlatformTelemetrySample): Record<string, unknown> {
  return {
    expiresAt: addDays(new Date(sample.sampledAt), TELEMETRY_SAMPLE_RETENTION_DAYS).toISOString(),
    policy: TELEMETRY_SAMPLE_RETENTION_POLICY,
    retentionDays: TELEMETRY_SAMPLE_RETENTION_DAYS
  };
}

function statusPageSync(scope: string, target: string): Record<string, unknown> {
  return {
    id: makeQueueId("status_page"),
    queue: "status-page-sync",
    scope,
    target
  };
}

function platformAlertNotificationOutboxId(idempotencyKey: string, routeId: string): string {
  return `platform_outbox_alert_notification_${createHash("sha256")
    .update(platformAlertNotificationOutboxIdempotencyKey(idempotencyKey, routeId))
    .digest("hex")
    .slice(0, 16)}`;
}

function platformAlertNotificationOutboxIdempotencyKey(idempotencyKey: string, routeId: string): string {
  return `platform-outbox:alert-notification:${idempotencyKey}:${routeId}`;
}
