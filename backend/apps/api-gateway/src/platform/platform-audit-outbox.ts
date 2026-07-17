import { createHash, randomUUID } from "node:crypto";
import type { ServiceAdminActor } from "../identity/service-admin-auth.js";
import type {
  PlatformAuditOutboxRepository,
  PlatformAuditRow,
  PlatformOutboxRow
} from "./platform.repository.js";

export type PlatformMutationKind = "alert" | "incident" | "rollout";

interface PersistPlatformIncidentMutationInput {
  actor?: ServiceAdminActor;
  customerVisible: boolean;
  idempotencyKey?: string;
  incidentId: string;
  message: string;
  reason: string;
  repository: PlatformAuditOutboxRepository;
  status: string;
  traceId: string;
}

interface PersistPlatformAlertMutationInput {
  actor?: ServiceAdminActor;
  componentId: string;
  idempotencyKey: string;
  reason: string;
  repository: PlatformAuditOutboxRepository;
  traceId: string;
}

interface PersistPlatformRolloutMutationInput {
  actor?: ServiceAdminActor;
  enabledTenantIds?: string[];
  flagKey: string;
  idempotencyKey: string;
  idempotencyPayload?: Record<string, unknown>;
  reason: string;
  repository: PlatformAuditOutboxRepository;
  rollout: number;
  status: string;
  traceId: string;
}

export interface PlatformMutationPersistenceResult {
  audit: PlatformAuditRow;
  outbox: PlatformOutboxRow | null;
}

export interface PlatformAuditOutboxAsyncRepository {
  findPlatformAuditRowAsync(idempotencyKey: string): Promise<PlatformAuditRow | undefined>;
  findPlatformOutboxRowAsync(idempotencyKey: string): Promise<PlatformOutboxRow | undefined>;
  savePlatformAuditRowAsync(row: PlatformAuditRow): Promise<PlatformAuditRow>;
  savePlatformOutboxRowAsync(row: PlatformOutboxRow): Promise<PlatformOutboxRow>;
}

export function persistPlatformIncidentMutation(
  input: PersistPlatformIncidentMutationInput
): PlatformMutationPersistenceResult {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("incident", input.idempotencyKey, input.incidentId);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("incident", input.idempotencyKey, input.incidentId);
  const auditFingerprint = fingerprintPlatformMutation("incident-audit", {
    incidentId: input.incidentId,
    message: input.message,
    reason: input.reason
  });
  const outboxFingerprint = fingerprintPlatformMutation("incident-outbox", {
    customerVisible: input.customerVisible,
    incidentId: input.incidentId,
    message: input.message,
    status: input.status
  });

  const audit = persistPlatformAuditRow(input.repository, {
    action: "incident.update",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("incident", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "incident",
    payload: {
      customerVisible: input.customerVisible,
      incidentId: input.incidentId,
      message: input.message,
      status: input.status
    },
    reason: input.reason,
    result: "queued",
    target: input.incidentId,
    traceId: input.traceId
  });

  const outbox = persistPlatformOutboxRow(input.repository, {
    aggregateId: input.incidentId,
    aggregateType: "platform_incident",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("incident", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "incident",
    payload: {
      customerVisible: input.customerVisible,
      incidentId: input.incidentId,
      message: input.message,
      status: input.status
    },
    queue: input.customerVisible ? "status-page-sync" : "platform-notification",
    status: "pending",
    target: input.incidentId,
    traceId: input.traceId,
    type: input.customerVisible
      ? "platform.incident.status_page.requested"
      : "platform.incident.internal_notification.requested"
  });

  return { audit, outbox };
}

export async function persistPlatformIncidentMutationAsync(
  input: Omit<PersistPlatformIncidentMutationInput, "repository"> & { repository: PlatformAuditOutboxAsyncRepository }
): Promise<PlatformMutationPersistenceResult> {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("incident", input.idempotencyKey, input.incidentId);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("incident", input.idempotencyKey, input.incidentId);
  const auditFingerprint = fingerprintPlatformMutation("incident-audit", {
    incidentId: input.incidentId,
    message: input.message,
    reason: input.reason
  });
  const outboxFingerprint = fingerprintPlatformMutation("incident-outbox", {
    customerVisible: input.customerVisible,
    incidentId: input.incidentId,
    message: input.message,
    status: input.status
  });
  const audit = await persistPlatformAuditRowAsync(input.repository, {
    action: "incident.update",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("incident", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "incident",
    payload: {
      customerVisible: input.customerVisible,
      incidentId: input.incidentId,
      message: input.message,
      status: input.status
    },
    reason: input.reason,
    result: "queued",
    target: input.incidentId,
    traceId: input.traceId
  });
  const outbox = await persistPlatformOutboxRowAsync(input.repository, {
    aggregateId: input.incidentId,
    aggregateType: "platform_incident",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("incident", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "incident",
    payload: {
      customerVisible: input.customerVisible,
      incidentId: input.incidentId,
      message: input.message,
      status: input.status
    },
    queue: input.customerVisible ? "status-page-sync" : "platform-notification",
    status: "pending",
    target: input.incidentId,
    traceId: input.traceId,
    type: input.customerVisible
      ? "platform.incident.status_page.requested"
      : "platform.incident.internal_notification.requested"
  });

  return { audit, outbox };
}

export function persistPlatformAlertMutation(
  input: PersistPlatformAlertMutationInput
): PlatformMutationPersistenceResult {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("alert", input.idempotencyKey, input.componentId);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("alert", input.idempotencyKey, input.componentId);
  const auditFingerprint = fingerprintPlatformMutation("alert-audit", {
    reason: input.reason
  });
  const outboxFingerprint = fingerprintPlatformMutation("alert-outbox", {
    componentId: input.componentId
  });

  const audit = persistPlatformAuditRow(input.repository, {
    action: "platform.alert.acknowledge",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("alert", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "alert",
    payload: {
      componentId: input.componentId
    },
    reason: input.reason,
    result: "queued",
    target: input.componentId,
    traceId: input.traceId
  });

  const outbox = persistPlatformOutboxRow(input.repository, {
    aggregateId: input.componentId,
    aggregateType: "platform_component",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("alert", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "alert",
    payload: {
      componentId: input.componentId,
      scope: "component-alert"
    },
    queue: "status-page-sync",
    status: "pending",
    target: input.componentId,
    traceId: input.traceId,
    type: "platform.alert.status_page.requested"
  });

  return { audit, outbox };
}

export async function persistPlatformAlertMutationAsync(
  input: Omit<PersistPlatformAlertMutationInput, "repository"> & { repository: PlatformAuditOutboxAsyncRepository }
): Promise<PlatformMutationPersistenceResult> {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("alert", input.idempotencyKey, input.componentId);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("alert", input.idempotencyKey, input.componentId);
  const auditFingerprint = fingerprintPlatformMutation("alert-audit", {
    reason: input.reason
  });
  const outboxFingerprint = fingerprintPlatformMutation("alert-outbox", {
    componentId: input.componentId
  });
  const audit = await persistPlatformAuditRowAsync(input.repository, {
    action: "platform.alert.acknowledge",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("alert", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "alert",
    payload: {
      componentId: input.componentId
    },
    reason: input.reason,
    result: "queued",
    target: input.componentId,
    traceId: input.traceId
  });
  const outbox = await persistPlatformOutboxRowAsync(input.repository, {
    aggregateId: input.componentId,
    aggregateType: "platform_component",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("alert", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "alert",
    payload: {
      componentId: input.componentId,
      scope: "component-alert"
    },
    queue: "status-page-sync",
    status: "pending",
    target: input.componentId,
    traceId: input.traceId,
    type: "platform.alert.status_page.requested"
  });

  return { audit, outbox };
}

export function persistPlatformRolloutMutation(
  input: PersistPlatformRolloutMutationInput
): PlatformMutationPersistenceResult {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("rollout", input.idempotencyKey, input.flagKey);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("rollout", input.idempotencyKey, input.flagKey);
  const auditFingerprint = fingerprintPlatformMutation("rollout-audit", {
    request: input.idempotencyPayload ?? {
      enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds),
      rollout: input.rollout,
      status: input.status
    },
    reason: input.reason,
  });
  const outboxFingerprint = fingerprintPlatformMutation("rollout-outbox", {
    flagKey: input.flagKey,
    request: input.idempotencyPayload ?? {
      enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds),
      rollout: input.rollout,
      status: input.status
    }
  });

  const audit = persistPlatformAuditRow(input.repository, {
    action: "feature_flag.update",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("rollout", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "rollout",
    payload: {
      ...(input.enabledTenantIds ? { enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds) } : {}),
      flagKey: input.flagKey,
      rollout: input.rollout,
      status: input.status
    },
    reason: input.reason,
    result: "queued",
    target: input.flagKey,
    traceId: input.traceId
  });

  const outbox = persistPlatformOutboxRow(input.repository, {
    aggregateId: input.flagKey,
    aggregateType: "platform_feature_flag",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("rollout", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "rollout",
    payload: {
      ...(input.enabledTenantIds ? { enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds) } : {}),
      flagKey: input.flagKey,
      rollout: input.rollout,
      status: input.status
    },
    queue: "feature-flag-rollout",
    status: "pending",
    target: input.flagKey,
    traceId: input.traceId,
    type: "platform.feature_flag.rollout.requested"
  });

  return { audit, outbox };
}

export async function persistPlatformRolloutMutationAsync(
  input: Omit<PersistPlatformRolloutMutationInput, "repository"> & { repository: PlatformAuditOutboxAsyncRepository }
): Promise<PlatformMutationPersistenceResult> {
  const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("rollout", input.idempotencyKey, input.flagKey);
  const outboxIdempotencyKey = buildPlatformOutboxIdempotencyKey("rollout", input.idempotencyKey, input.flagKey);
  const auditFingerprint = fingerprintPlatformMutation("rollout-audit", {
    request: input.idempotencyPayload ?? {
      enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds),
      rollout: input.rollout,
      status: input.status
    },
    reason: input.reason,
  });
  const outboxFingerprint = fingerprintPlatformMutation("rollout-outbox", {
    flagKey: input.flagKey,
    request: input.idempotencyPayload ?? {
      enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds),
      rollout: input.rollout,
      status: input.status
    }
  });
  const audit = await persistPlatformAuditRowAsync(input.repository, {
    action: "feature_flag.update",
    actor: input.actor?.id ?? "service-admin",
    actorName: input.actor?.name ?? "Service Admin",
    createdAt: new Date().toISOString(),
    fingerprint: auditFingerprint,
    id: makePlatformAuditId("rollout", auditIdempotencyKey),
    idempotencyKey: auditIdempotencyKey,
    immutable: true,
    mutationKind: "rollout",
    payload: {
      ...(input.enabledTenantIds ? { enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds) } : {}),
      flagKey: input.flagKey,
      rollout: input.rollout,
      status: input.status
    },
    reason: input.reason,
    result: "queued",
    target: input.flagKey,
    traceId: input.traceId
  });
  const outbox = await persistPlatformOutboxRowAsync(input.repository, {
    aggregateId: input.flagKey,
    aggregateType: "platform_feature_flag",
    createdAt: audit.createdAt,
    fingerprint: outboxFingerprint,
    id: makePlatformOutboxId("rollout", outboxIdempotencyKey),
    idempotencyKey: outboxIdempotencyKey,
    mutationKind: "rollout",
    payload: {
      ...(input.enabledTenantIds ? { enabledTenantIds: normalizedEnabledTenantIds(input.enabledTenantIds) } : {}),
      flagKey: input.flagKey,
      rollout: input.rollout,
      status: input.status
    },
    queue: "feature-flag-rollout",
    status: "pending",
    target: input.flagKey,
    traceId: input.traceId,
    type: "platform.feature_flag.rollout.requested"
  });

  return { audit, outbox };
}

function persistPlatformAuditRow(
  repository: PlatformAuditOutboxRepository,
  row: PlatformAuditRow
): PlatformAuditRow {
  const existing = repository.findPlatformAuditRow(row.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== row.fingerprint) {
      throw new Error("platform_audit_idempotency_conflict");
    }

    return existing;
  }

  return repository.savePlatformAuditRow(row);
}

function persistPlatformOutboxRow(
  repository: PlatformAuditOutboxRepository,
  row: PlatformOutboxRow
): PlatformOutboxRow {
  const existing = repository.findPlatformOutboxRow(row.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== row.fingerprint) {
      throw new Error("platform_outbox_idempotency_conflict");
    }

    return existing;
  }

  return repository.savePlatformOutboxRow(row);
}

async function persistPlatformAuditRowAsync(
  repository: PlatformAuditOutboxAsyncRepository,
  row: PlatformAuditRow
): Promise<PlatformAuditRow> {
  const existing = await repository.findPlatformAuditRowAsync(row.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== row.fingerprint) {
      throw new Error("platform_audit_idempotency_conflict");
    }

    return existing;
  }

  return repository.savePlatformAuditRowAsync(row);
}

async function persistPlatformOutboxRowAsync(
  repository: PlatformAuditOutboxAsyncRepository,
  row: PlatformOutboxRow
): Promise<PlatformOutboxRow> {
  const existing = await repository.findPlatformOutboxRowAsync(row.idempotencyKey);
  if (existing) {
    if (existing.fingerprint !== row.fingerprint) {
      throw new Error("platform_outbox_idempotency_conflict");
    }

    return existing;
  }

  return repository.savePlatformOutboxRowAsync(row);
}

export function buildPlatformAuditIdempotencyKey(
  kind: PlatformMutationKind,
  idempotencyKey: string | undefined,
  target: string
): string {
  return `platform-audit:${kind}:${idempotencyKey ?? target}`;
}

function normalizedEnabledTenantIds(tenantIds: string[] | undefined): string[] | undefined {
  return tenantIds ? [...new Set(tenantIds.map((tenantId) => tenantId.trim()).filter(Boolean))].sort() : undefined;
}

function buildPlatformOutboxIdempotencyKey(
  kind: PlatformMutationKind,
  idempotencyKey: string | undefined,
  target: string
): string {
  return `platform-outbox:${kind}:${idempotencyKey ?? target}`;
}

function fingerprintPlatformMutation(scope: string, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify({ payload, scope }))
    .digest("hex");
}

function makePlatformAuditId(kind: PlatformMutationKind, idempotencyKey: string): string {
  return `platform_audit_${kind}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

function makePlatformOutboxId(kind: PlatformMutationKind, idempotencyKey: string): string {
  return `platform_outbox_${kind}_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

export function makeEphemeralPlatformMutationIdempotencyKey(scope: string): string {
  return `${scope}_${randomUUID()}`;
}
