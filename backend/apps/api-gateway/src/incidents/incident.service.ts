import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import type { PlatformIncident } from "../platform/platform.types.js";
import { PlatformRepository } from "../platform/platform.repository.js";
import {
  makeEphemeralPlatformMutationIdempotencyKey,
  persistPlatformIncidentMutationAsync
} from "../platform/platform-audit-outbox.js";

const INCIDENT_SERVICE = "incidentService";

interface IncidentFilters {
  componentId?: string;
  severity?: string;
  status?: string;
  tenantId?: string;
}

interface IncidentUpdatePayload {
  actor?: ServiceAdminActor;
  confirmed?: boolean;
  customerVisible?: boolean;
  idempotencyKey?: string;
  incidentId?: string;
  message?: string;
  reason?: string;
  status?: PlatformIncident["status"];
}

interface IncidentIdempotencyEntry {
  fingerprint: string;
  result: Record<string, unknown>;
}

export class IncidentService {
  private readonly idempotencyIndex: Map<string, IncidentIdempotencyEntry>;

  constructor(private readonly platformRepository = PlatformRepository.default()) {
    try {
      this.idempotencyIndex = new Map(
        this.platformRepository.readState().incidentIdempotencyKeys.map((item) => [item.key, {
          fingerprint: item.fingerprint,
          result: clone(item.result)
        }])
      );
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("prisma_platform_async_required")) {
        throw error;
      }

      this.idempotencyIndex = new Map();
    }
  }

  async fetchIncidents(filters: IncidentFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const items = (await this.platformRepository.listIncidentsAsync()).filter((incident) => {
      const statusMatches = !filters.status || filters.status === "all" || incident.status === filters.status;
      const severityMatches = !filters.severity || filters.severity === "all" || incident.severity === filters.severity;
      const componentMatches = !filters.componentId || filters.componentId === "all" || incident.componentId === filters.componentId;
      const tenantMatches = !filters.tenantId || incident.affectedTenantIds.includes(filters.tenantId);
      return statusMatches && severityMatches && componentMatches && tenantMatches;
    });

    return createEnvelope({
      service: INCIDENT_SERVICE,
      operation: "fetchIncidents",
      traceId: incidentTraceId("fetchIncidents"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        components: (await this.platformRepository.listComponentsAsync()).map(({ id, name, status }) => ({ id, name, status })),
        filters,
        items: clone(items),
        maintenanceWindows: clone(await this.platformRepository.listMaintenanceWindowsAsync())
      }
    });
  }

  async fetchIncidentDetail(incidentId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const incident = await this.findIncident(incidentId);

    if (!incident) {
      return notFoundEnvelope("fetchIncidentDetail", "incident_not_found", `Incident ${incidentId} was not found.`, { incidentId });
    }

    return createEnvelope({
      service: INCIDENT_SERVICE,
      operation: "fetchIncidentDetail",
      traceId: incidentTraceId("fetchIncidentDetail"),
      meta: apiMeta({ incidentId }),
      data: await incidentDetailPayload(incident, this.platformRepository)
    });
  }

  async addIncidentUpdate(payload: IncidentUpdatePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const incident = await this.findIncident(request.incidentId ?? "");

    if (!incident) {
      return notFoundEnvelope("addIncidentUpdate", "incident_not_found", `Incident ${request.incidentId ?? "(empty)"} was not found.`, {
        incidentId: request.incidentId ?? null
      });
    }

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope("addIncidentUpdate", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        incidentId: incident.id,
        reason: request.reason ?? null
      });
    }

    if (String(request.message ?? "").trim().length < 10) {
      return invalidEnvelope("addIncidentUpdate", "message_required", "Incident updates require a customer-visible message of at least 10 characters.", {
        incidentId: incident.id,
        message: request.message ?? null
      });
    }

    if (!isSupportedIncidentStatus(request.status)) {
      return invalidEnvelope("addIncidentUpdate", "incident_status_unsupported", "Incident status is not supported.", {
        incidentId: incident.id,
        status: request.status ?? null
      });
    }

    if (!request.confirmed) {
      return invalidEnvelope("addIncidentUpdate", "confirmation_required", "Explicit confirmation is required for incident timeline updates.", {
        confirmation: { required: true },
        incidentId: incident.id,
        reason: request.reason
      });
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    const fingerprint = buildIncidentUpdateFingerprint(incident.id, request);
    const traceId = incidentTraceId("addIncidentUpdate");
    let outcome:
      | { kind: "conflict" }
      | { kind: "duplicate"; result: Record<string, unknown> }
      | { kind: "created"; result: Record<string, unknown> };
    try {
      outcome = await this.platformRepository.runInTransaction(`platform:incident:${incident.id}`, async (repository) => {
        const currentIncident = (await repository.listIncidentsAsync()).find((item) => item.id === incident.id);
        if (!currentIncident) {
          throw new Error(`incident_not_found_during_transaction:${incident.id}`);
        }
        const persistedCached = idempotencyKey ? await repository.findIncidentIdempotencyKeyAsync(idempotencyKey) : undefined;
        const cached = persistedCached ?? (idempotencyKey ? this.idempotencyIndex.get(idempotencyKey) : undefined);
        if (cached) {
          return cached.fingerprint === fingerprint
            ? { kind: "duplicate" as const, result: clone(cached.result) }
            : { kind: "conflict" as const };
        }

        const customerVisible = request.customerVisible !== false;
        const nextIncident = clone(currentIncident);
        nextIncident.status = request.status ?? nextIncident.status;
        nextIncident.updatedAt = new Date().toISOString();
        nextIncident.updates = [
          { at: "now", author: request.actor?.name ?? "service-admin", text: String(request.message).trim() },
          ...nextIncident.updates
        ];
        const persistedIncident = await repository.saveIncidentAsync(nextIncident);
        const mutationPersistence = await persistPlatformIncidentMutationAsync({
          actor: request.actor,
          customerVisible,
          idempotencyKey: idempotencyKey ?? makeEphemeralPlatformMutationIdempotencyKey(`incident-${incident.id}`),
          incidentId: incident.id,
          message: String(request.message).trim(),
          reason: String(request.reason).trim(),
          repository,
          status: String(request.status ?? nextIncident.status),
          traceId
        });
        const result = {
          auditEvent: auditEvent("incident.update", incident.id, request.reason, request.actor),
          incident: clone(persistedIncident),
          platformAudit: mutationPersistence.audit,
          platformOutbox: mutationPersistence.outbox,
          reason: normalizeReason(request.reason),
          realtimeEvent: realtimeIncidentEvent(persistedIncident, traceId),
          statusPageSync: customerVisible ? statusPageSync("incident-update", persistedIncident.id) : null
        };
        if (idempotencyKey) {
          await repository.saveIncidentIdempotencyKeyAsync({ key: idempotencyKey, fingerprint, result: clone(result) });
        }
        return { kind: "created" as const, result };
      });
    } catch (error) {
      if (isPlatformIdempotencyConflict(error)) {
        outcome = { kind: "conflict" };
      } else {
        throw error;
      }
    }

    if (outcome.kind === "conflict") {
      return conflictEnvelope("addIncidentUpdate", "idempotency_key_reused", "Idempotency key was already used for a different incident update request.", {
        idempotencyKey,
        incidentId: incident.id
      });
    }

    if (idempotencyKey && outcome.kind === "created") {
      this.idempotencyIndex.set(idempotencyKey, { fingerprint, result: clone(outcome.result) });
    }

    return createEnvelope({
      service: INCIDENT_SERVICE,
      operation: "addIncidentUpdate",
      traceId,
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null, incidentId: incident.id }),
      data: outcome.kind === "duplicate" ? { ...clone(outcome.result), duplicate: true } : outcome.result
    });
  }

  private async findIncident(incidentId: string): Promise<PlatformIncident | undefined> {
    return (await this.platformRepository.listIncidentsAsync()).find((incident) => incident.id === incidentId);
  }
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
    id: makeAuditId("incident"),
    action,
    actor: actor?.id ?? "service-admin",
    actorName: actor?.name ?? "Service Admin",
    immutable: true,
    reason: normalizeReason(reason),
    target
  };
}

function buildIncidentUpdateFingerprint(incidentId: string, request: IncidentUpdatePayload): string {
  return JSON.stringify({
    customerVisible: request.customerVisible !== false,
    incidentId,
    message: String(request.message ?? "").trim(),
    reason: normalizeReason(request.reason),
    status: request.status ?? null
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasAuditReason(reason: unknown): boolean {
  return typeof reason === "string" && reason.trim().length >= 8;
}

function isPlatformIdempotencyConflict(error: unknown): boolean {
  return error instanceof Error && [
    "platform_audit_idempotency_conflict",
    "platform_outbox_idempotency_conflict"
  ].some((code) => error.message.includes(code));
}

async function incidentDetailPayload(incident: PlatformIncident, platformRepository: PlatformRepository): Promise<Record<string, unknown>> {
  const platformTenants = await platformRepository.listPlatformTenantsAsync();
  const platformComponents = await platformRepository.listComponentsAsync();
  const incidentPostmortems = await platformRepository.listIncidentPostmortemsAsync();
  return {
    affectedTenants: platformTenants.filter((tenant) => incident.affectedTenantIds.includes(tenant.id)),
    component: platformComponents.find((component) => component.id === incident.componentId) ?? null,
    incident: clone(incident),
    postmortem: incidentPostmortems.find((postmortem) => postmortem.incidentId === incident.id) ?? {
      incidentId: incident.id,
      status: "not_started",
      dueAt: null,
      owner: incident.owner
    },
    statusPagePublication: {
      public: true,
      tenantNamesExposed: false,
      url: `https://status.local/incidents/${incident.id}`
    },
    timeline: clone(incident.updates)
  };
}

function incidentTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(INCIDENT_SERVICE, operation);
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INCIDENT_SERVICE,
    operation,
    traceId: incidentTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INCIDENT_SERVICE,
    operation,
    traceId: incidentTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function isSupportedIncidentStatus(status: PlatformIncident["status"] | undefined): boolean {
  return status === undefined || ["identified", "investigating", "monitoring", "resolved"].includes(status);
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeEventId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function normalizeReason(reason: string | undefined): string | null {
  return typeof reason === "string" ? reason.trim() : null;
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INCIDENT_SERVICE,
    operation,
    traceId: incidentTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function realtimeIncidentEvent(incident: PlatformIncident, traceId: string): Record<string, unknown> {
  return {
    data: {
      incidentId: incident.id,
      severity: incident.severity,
      status: incident.status
    },
    eventId: makeEventId("incident"),
    eventName: "incident.updated",
    occurredAt: new Date().toISOString(),
    resourceId: incident.id,
    resourceType: "incident",
    schemaVersion: "incident/v1",
    tenantId: "platform",
    traceId
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
