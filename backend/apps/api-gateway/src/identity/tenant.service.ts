import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { hasAuditReason } from "./backend-ids.js";
import { IdentityRepository, type IdentityTenant } from "./identity.repository.js";
import { apiMeta, identityTraceId } from "./identity-meta.js";

const SERVICE = "tenantService";
const supportedTenantStatuses = new Set(["active", "watch", "restricted", "trial"]);

interface TenantFilters {
  query?: string;
  region?: string;
  status?: string;
}

export interface TenantListData {
  items: IdentityTenant[];
  filters: TenantFilters;
    totals: {
      all: number;
      active: number;
      trial: number;
      watch: number;
      restricted: number;
    };
}

export interface TenantDetailData {
  tenant: IdentityTenant;
  users: Awaited<ReturnType<IdentityRepository["findTenantUsers"]>>;
  tariff?: Awaited<ReturnType<IdentityRepository["listServiceAdminTariffs"]>>[number];
  incidents: Awaited<ReturnType<IdentityRepository["listServiceAdminIncidents"]>>;
  flags: Awaited<ReturnType<IdentityRepository["listServiceAdminFeatureFlags"]>>;
  auditEvents: Awaited<ReturnType<IdentityRepository["findTenantAuditEvents"]>>;
}

interface TenantStatusPayload {
  confirmed?: boolean;
  reason?: string;
  status: string;
  tenantId: string;
}

export class TenantService {
  constructor(private readonly identityRepository = IdentityRepository.default()) {}

  async fetchTenants(filters: TenantFilters = {}): Promise<BackendEnvelope<TenantListData>> {
    const allTenants = await this.identityRepository.listTenants();
    const filteredTenants = allTenants.filter((tenant) => {
      const statusMatches = !filters.status || filters.status === "all" || tenant.status === filters.status;
      const regionMatches = !filters.region || filters.region === "all" || tenant.region === filters.region;
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [tenant.name, tenant.legalName, tenant.owner, tenant.ownerEmail]
        .some((value) => String(value ?? "").toLowerCase().includes(query));

      return statusMatches && regionMatches && queryMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchTenants",
      traceId: identityTraceId(SERVICE, "fetchTenants"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        items: filteredTenants,
        filters,
        totals: {
          all: allTenants.length,
          active: allTenants.filter((tenant) => tenant.status === "active").length,
          trial: allTenants.filter((tenant) => tenant.status === "trial").length,
          watch: allTenants.filter((tenant) => tenant.status === "watch").length,
          restricted: allTenants.filter((tenant) => tenant.status === "restricted").length
        }
      }
    });
  }

  async fetchTenantDetail(tenantId: string): Promise<BackendEnvelope<TenantDetailData | Record<string, never>>> {
    const tenant = await this.identityRepository.findTenant(tenantId);

    if (!tenant) {
      return createEnvelope({
        service: SERVICE,
        operation: "fetchTenantDetail",
        traceId: identityTraceId(SERVICE, "fetchTenantDetail"),
        status: "not_found",
        meta: apiMeta({ tenantId }),
        data: {},
        error: { code: "tenant_not_found", message: `Tenant ${tenantId} was not found.` }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "fetchTenantDetail",
      traceId: identityTraceId(SERVICE, "fetchTenantDetail"),
      meta: apiMeta({ tenantId }),
        data: await this.buildTenantDetail(tenant)
    });
  }

  async updateTenantStatus({ confirmed = false, reason, status, tenantId }: TenantStatusPayload): Promise<BackendEnvelope<unknown>> {
    const tenant = await this.identityRepository.findTenant(tenantId);

    if (!tenant) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        traceId: identityTraceId(SERVICE, "updateTenantStatus"),
        status: "not_found",
        meta: apiMeta({ tenantId }),
        data: {},
        error: { code: "tenant_not_found", message: `Tenant ${tenantId} was not found.` }
      });
    }

    if (!String(status ?? "").trim()) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        traceId: identityTraceId(SERVICE, "updateTenantStatus"),
        status: "invalid",
        meta: apiMeta({ tenantId }),
        data: { reason, status, tenantId },
        error: { code: "status_required", message: "A target tenant status is required." }
      });
    }

    if (!supportedTenantStatuses.has(status)) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        traceId: identityTraceId(SERVICE, "updateTenantStatus"),
        status: "invalid",
        meta: apiMeta({ tenantId }),
        data: { reason, status, tenantId, supportedStatuses: Array.from(supportedTenantStatuses) },
        error: { code: "status_unsupported", message: `Tenant status ${status} is not supported.` }
      });
    }

    if (!hasAuditReason(reason)) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        traceId: identityTraceId(SERVICE, "updateTenantStatus"),
        status: "invalid",
        meta: apiMeta({ tenantId }),
        data: { reason, status, tenantId },
        error: { code: "reason_required", message: "A service-admin reason of at least 8 characters is required." }
      });
    }

    if (!confirmed) {
      return createEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        traceId: identityTraceId(SERVICE, "updateTenantStatus"),
        status: "invalid",
        meta: apiMeta({ tenantId }),
        data: {
          confirmation: { required: true },
          reason,
          status,
          tenantId
        },
        error: { code: "confirmation_required", message: "Explicit confirmation is required for tenant status changes." }
      });
    }

    const traceId = identityTraceId(SERVICE, "updateTenantStatus");
    const persisted = await this.identityRepository.updateTenantStatus({
      reason: reason ?? "",
      status,
      tenantId,
      traceId
    });

    return createEnvelope({
      service: SERVICE,
      operation: "updateTenantStatus",
      traceId,
      meta: apiMeta({ tenantId }),
      data: {
        tenant: persisted.tenant,
        auditEvent: {
          ...persisted.auditEvent,
          from: tenant.status,
          to: status,
          immutable: true
        },
        outbox: persisted.outbox,
        confirmationRequired: true
      }
    });
  }

  private async buildTenantDetail(tenant: IdentityTenant): Promise<TenantDetailData> {
    const [users, auditEvents, tariffs, incidents, featureFlags] = await Promise.all([
      this.identityRepository.findTenantUsers(tenant.id),
      this.identityRepository.findTenantAuditEvents(tenant.id),
      this.identityRepository.listServiceAdminTariffs(),
      this.identityRepository.listServiceAdminIncidents(),
      this.identityRepository.listServiceAdminFeatureFlags()
    ]);

    return {
      tenant,
      users,
      tariff: tariffs.find((tariff) => tariff.id === tenant.planId),
      incidents: incidents.filter((incident) => incident.affectedTenantIds.includes(tenant.id)),
      flags: featureFlags.filter((flag) => flag.enabledTenantIds.includes(tenant.id)),
      auditEvents
    };
  }
}
