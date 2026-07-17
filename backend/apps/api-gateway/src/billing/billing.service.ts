import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import {
  BillingRepository,
  type BillingApproval,
  type BillingAuditEvent,
  type BillingInvoiceState,
  type BillingPaymentDunningState,
  type BillingPaymentRetryKey,
  type BillingPaymentRetrySchedule,
  type BillingProviderSyncAuditEvent,
  type BillingProviderSyncEvent,
  type BillingQuotaLedgerEntry,
  type BillingQuotaReservation,
  type BillingReconciliationConflict,
  type BillingSubscriptionState,
  type BillingSyncJob
} from "./billing.repository.js";
import { type BillingTariff, type TenantBillingState } from "./billing.types.js";

const BILLING_SERVICE = "billingService";
const QUOTA_SERVICE = "quotaService";

interface TariffChangePayload {
  actor?: ServiceAdminActor;
  approvalId?: string;
  confirmationText?: string;
  confirmed?: boolean;
  nextPlanId?: string;
  reason?: string;
  tenantId?: string;
}

interface QuotaCheckPayload {
  idempotencyKey?: string;
  mode?: string;
  requested?: unknown;
  resource?: string;
  tenantId?: string;
}

interface QuotaReservationPayload {
  idempotencyKey?: string;
  requested?: unknown;
  resource?: string;
  tenantId?: string;
}

interface QuotaReservationTransitionPayload {
  idempotencyKey?: string;
  reservationId?: string;
}

interface ProviderSyncPayload {
  actor?: ServiceAdminActor;
  approvalId?: string;
  eventType?: string;
  idempotencyKey?: string;
  invoice?: Partial<BillingInvoiceState>;
  provider?: string;
  subscription?: Partial<BillingSubscriptionState>;
  tenantId?: string;
}

interface QuotaMetric {
  available: number;
  resource: string;
  used: number;
  limit: number;
  remaining: number;
  reserved: number;
  status: "ok" | "over_limit";
}

export class BillingService {
  constructor(private readonly billingRepository = BillingRepository.default()) {}

  async fetchTariffs(): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tariffs = await this.billingRepository.listTariffs();

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "fetchTariffs",
      traceId: billingTraceId(BILLING_SERVICE, "fetchTariffs"),
      meta: apiMeta(),
      data: {
        billingMode: "monthly",
        currency: "RUB",
        items: clone(tariffs),
        previewRequired: true
      }
    });
  }

  async previewTariffChange(payload: TariffChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);
    const nextTariff = await this.findTariff(request.nextPlanId);

    if (!tenant) {
      return notFoundEnvelope(BILLING_SERVICE, "previewTariffChange", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    if (!nextTariff) {
      return notFoundEnvelope(BILLING_SERVICE, "previewTariffChange", "tariff_not_found", `Tariff ${request.nextPlanId ?? "(empty)"} was not found.`, {
        nextPlanId: request.nextPlanId ?? null,
        tenantId: tenant.id
      });
    }

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope(BILLING_SERVICE, "previewTariffChange", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        nextPlanId: nextTariff.id,
        tenantId: tenant.id
      });
    }

    const currentTariff = await this.findTariff(tenant.planId);

    if (currentTariff?.id === nextTariff.id) {
      return conflictEnvelope(BILLING_SERVICE, "previewTariffChange", "tariff_noop", "Tenant is already on the requested tariff.", {
        nextPlanId: nextTariff.id,
        tenantId: tenant.id
      });
    }

    const preview = buildTariffPreview(tenant, currentTariff, nextTariff, request.reason);

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "previewTariffChange",
      traceId: billingTraceId(BILLING_SERVICE, "previewTariffChange"),
      meta: apiMeta({ tenantId: tenant.id }),
      data: preview
    });
  }

  async changeTenantTariff(payload: TariffChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);
    const nextTariff = await this.findTariff(request.nextPlanId);

    if (!tenant) {
      return notFoundEnvelope(BILLING_SERVICE, "changeTenantTariff", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    if (!nextTariff) {
      return notFoundEnvelope(BILLING_SERVICE, "changeTenantTariff", "tariff_not_found", `Tariff ${request.nextPlanId ?? "(empty)"} was not found.`, {
        nextPlanId: request.nextPlanId ?? null,
        tenantId: tenant.id
      });
    }

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        nextPlanId: nextTariff.id,
        tenantId: tenant.id
      });
    }

    const currentTariff = await this.findTariff(tenant.planId);

    if (currentTariff?.id === nextTariff.id) {
      return conflictEnvelope(BILLING_SERVICE, "changeTenantTariff", "tariff_noop", "Tenant is already on the requested tariff.", {
        applied: false,
        nextPlanId: nextTariff.id,
        tenantId: tenant.id
      });
    }

    const expectedText = confirmationText(tenant.id, nextTariff.id);
    const traceId = billingTraceId(BILLING_SERVICE, "changeTenantTariff");
    const auditBase = {
      action: "tenant.tariff.change",
      actor: request.actor?.id ?? "service-admin",
      actorName: request.actor?.name ?? "Service Admin",
      at: new Date().toISOString(),
      from: currentTariff?.id ?? tenant.planId,
      immutable: true as const,
      reason: request.reason?.trim(),
      severity: "critical" as const,
      target: tenant.id,
      tenantId: tenant.id,
      traceId,
      to: nextTariff.id
    };

    if (!request.confirmed || request.confirmationText !== expectedText) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "confirmation_required", "Explicit tariff change confirmation text is required.", {
        applied: false,
        auditEvent: {
          id: makeAuditId("billing_tariff"),
          ...auditBase,
          result: "blocked"
        },
        confirmation: {
          expectedText,
          required: true
        },
        tenantId: tenant.id
      });
    }

    const preview = buildTariffPreview(tenant, currentTariff, nextTariff, request.reason);
    const approval = preview.approval as { required?: boolean };
    if (approval.required && !String(request.approvalId ?? "").trim()) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "approval_required", "Approval is required before applying an over-limit or downgrade tariff change.", {
        applied: false,
        approval: preview.approval,
        auditEvent: {
          id: makeAuditId("billing_tariff"),
          ...auditBase,
          result: "blocked_approval_required"
        },
        capacityCheck: preview.capacityCheck,
        confirmation: preview.confirmation,
        tenantId: tenant.id
      });
    }
    if (approval.required) {
      const approvalValidation = await this.validateTariffApproval({
        approvalId: request.approvalId,
        auditBase,
        currentPlanId: currentTariff?.id ?? tenant.planId,
        nextPlanId: nextTariff.id,
        preview,
        tenantId: tenant.id
      });
      if (approvalValidation) {
        return approvalValidation;
      }
    }

    const auditEvent: BillingAuditEvent & { from: string; to: string } = {
      id: makeAuditId("billing_tariff"),
      ...auditBase,
      approvalId: request.approvalId ?? null,
      reason: auditBase.reason ?? "",
      result: "queued"
    };
    const syncJob: BillingSyncJob = {
      actor: auditBase.actor,
      actorName: auditBase.actorName,
      attempts: 0,
      auditEventId: auditEvent.id,
      createdAt: new Date().toISOString(),
      deadLetteredAt: null,
      fromPlanId: auditBase.from,
      id: makeQueueId("billing_sync"),
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      payload: {
        approvalId: request.approvalId ?? null,
        auditEvent,
        eventType: "billing.tenant.plan_changed",
        fromPlanId: auditBase.from,
        reason: auditBase.reason,
        tenantId: tenant.id,
        toPlanId: nextTariff.id
      },
      publishedAt: null,
      queue: "billing-sync",
      reason: auditBase.reason ?? "",
      status: "pending",
      tenantId: tenant.id,
      toPlanId: nextTariff.id,
      traceId
    };
    let persisted: { syncJob: BillingSyncJob; tenant: TenantBillingState };
    try {
      persisted = await this.billingRepository.applyTenantTariffChange({
        changes: {
          arr: nextTariff.priceMonthly * 12,
          monthlyRevenue: nextTariff.priceMonthly,
          planId: nextTariff.id
        },
        syncJob,
        tenantId: tenant.id
      });
    } catch {
      return errorEnvelope(BILLING_SERVICE, "changeTenantTariff", "billing_persistence_failed", "Billing tariff change could not be persisted.", {
        applied: false,
        auditEvent: {
          ...auditEvent,
          result: "failed"
        },
        queue: "billing-sync",
        tenantId: tenant.id
      });
    }

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "changeTenantTariff",
      traceId,
      meta: apiMeta({ tenantId: tenant.id }),
      data: {
        applied: true,
        auditEvent,
        billingJobId: persisted.syncJob.id,
        queue: "billing-sync",
        tenant: clone(persisted.tenant)
      }
    });
  }

  async checkQuota(payload: QuotaCheckPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);

    if (!tenant) {
      return notFoundEnvelope(QUOTA_SERVICE, "checkQuota", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    const tariff = await this.findTariff(tenant.planId);
    const resource = normalizeResource(request.resource);
    const requested = normalizeRequested(request.requested);
    const mode = normalizeQuotaMode(request.mode);
    const quota = quotaMetric(tenant, tariff, resource);

    if (!mode) {
      return invalidEnvelope(QUOTA_SERVICE, "checkQuota", "quota_mode_unsupported", `Quota mode ${request.mode ?? "(empty)"} is not supported.`, {
        mode: request.mode ?? null,
        tenantId: tenant.id
      });
    }

    if (!quota) {
      return invalidEnvelope(QUOTA_SERVICE, "checkQuota", "quota_resource_unsupported", `Quota resource ${resource} is not supported.`, {
        resource,
        tenantId: tenant.id
      });
    }

    const projected = quota.used + requested;
    const allowed = projected <= quota.limit;
    const traceId = billingTraceId(QUOTA_SERVICE, "checkQuota");
    const data = {
      decision: allowed ? "allow" : "deny",
      limit: quota.limit,
      projected,
      remaining: Math.max(0, quota.limit - quota.used),
      requested,
      resource,
      tenantId: tenant.id,
      used: quota.used
    };
    const responseData = mode === "record"
      ? await this.recordQuotaLedgerDecision({
        data,
        mode,
        requested,
        resource,
        tariff,
        tenant,
        traceId
      }, request)
      : { kind: "fresh" as const, data };

    if (responseData.kind === "error") {
      return responseData.envelope;
    }

    const quotaData = responseData.data;

    if (quotaData.decision !== "allow") {
      return createEnvelope({
        service: QUOTA_SERVICE,
        operation: "checkQuota",
        traceId,
        status: "denied",
        meta: apiMeta({ tenantId: tenant.id }),
        data: quotaData,
        error: { code: "quota_exceeded", message: `Quota ${String(quotaData.resource ?? resource)} would be exceeded for tenant ${tenant.id}.` }
      });
    }

    return createEnvelope({
      service: QUOTA_SERVICE,
      operation: "checkQuota",
      traceId,
      meta: apiMeta({ tenantId: tenant.id }),
      data: quotaData
    });
  }

  async reserveQuota(payload: QuotaReservationPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);

    if (!tenant) {
      return notFoundEnvelope(QUOTA_SERVICE, "reserveQuota", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return invalidEnvelope(QUOTA_SERVICE, "reserveQuota", "idempotency_key_required", "Quota reservation requires an idempotency key.", {
        tenantId: tenant.id
      });
    }

    const tariff = await this.findTariff(tenant.planId);
    const resource = normalizeResource(request.resource);
    const requested = normalizeRequested(request.requested);
    const quota = quotaMetric(tenant, tariff, resource);
    if (!quota) {
      return invalidEnvelope(QUOTA_SERVICE, "reserveQuota", "quota_resource_unsupported", `Quota resource ${resource} is not supported.`, {
        resource,
        tenantId: tenant.id
      });
    }

    const requestFingerprint = quotaReservationFingerprint({ requested, resource, tenantId: tenant.id });
    const cached = await this.billingRepository.findQuotaReservationByIdempotencyKey(idempotencyKey);
    if (cached) {
      if (cached.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(QUOTA_SERVICE, "reserveQuota", "idempotency_key_reused", "Idempotency key was already used for a different quota reservation request.", {
          idempotencyKey,
          tenantId: tenant.id
        });
      }

      return createEnvelope({
        service: QUOTA_SERVICE,
        operation: "reserveQuota",
        traceId: cached.traceId,
        meta: apiMeta({ tenantId: tenant.id }),
        data: quotaReservationResponseData(cached, true, "quota.reserve")
      });
    }

    const reserved = await this.activeReservedAmount(tenant.id, resource);
    const projected = quota.used + reserved + requested;
    if (projected > quota.limit) {
      return createEnvelope({
        service: QUOTA_SERVICE,
        operation: "reserveQuota",
        traceId: billingTraceId(QUOTA_SERVICE, "reserveQuota"),
        status: "denied",
        meta: apiMeta({ tenantId: tenant.id }),
        data: {
          decision: "deny",
          limit: quota.limit,
          projected,
          requested,
          reserved,
          resource,
          tenantId: tenant.id,
          used: quota.used
        },
        error: { code: "quota_exceeded", message: `Quota ${resource} would be exceeded for tenant ${tenant.id}.` }
      });
    }

    const now = new Date();
    const createdAt = now.toISOString();
    const traceId = billingTraceId(QUOTA_SERVICE, "reserveQuota");
    const auditEvent = buildBillingAuditEvent({
      action: "quota.reserve",
      reason: "quota_reserved",
      result: "reserved",
      severity: "info",
      target: resource,
      tenantId: tenant.id,
      traceId
    });
    const reservation: BillingQuotaReservation = {
      auditEvent,
      commitIdempotencyKey: null,
      committedAt: null,
      createdAt,
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      id: makeQueueId("quota_reservation"),
      idempotencyKey,
      limit: quota.limit,
      planId: tariff?.id ?? tenant.planId,
      releaseIdempotencyKey: null,
      releasedAt: null,
      requested,
      requestFingerprint,
      resource,
      status: "reserved",
      tenantId: tenant.id,
      traceId,
      updatedAt: createdAt,
      usedAfter: null,
      usedBefore: quota.used
    };

    let persisted: BillingQuotaReservation;
    try {
      persisted = await this.billingRepository.createQuotaReservation(reservation);
    } catch {
      return errorEnvelope(QUOTA_SERVICE, "reserveQuota", "quota_reservation_persistence_failed", "Quota reservation could not be persisted.", {
        idempotencyKey,
        tenantId: tenant.id
      });
    }

    return createEnvelope({
      service: QUOTA_SERVICE,
      operation: "reserveQuota",
      traceId: persisted.traceId,
      meta: apiMeta({ tenantId: tenant.id }),
      data: quotaReservationResponseData(persisted, false, "quota.reserve")
    });
  }

  async commitQuotaReservation(payload: QuotaReservationTransitionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const idempotencyKey = request.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return invalidEnvelope(QUOTA_SERVICE, "commitQuotaReservation", "idempotency_key_required", "Quota reservation commit requires an idempotency key.", {
        reservationId: request.reservationId ?? null
      });
    }

    const reservation = await this.billingRepository.findQuotaReservation(request.reservationId);
    if (!reservation) {
      return notFoundEnvelope(QUOTA_SERVICE, "commitQuotaReservation", "quota_reservation_not_found", `Quota reservation ${request.reservationId ?? "(empty)"} was not found.`, {
        reservationId: request.reservationId ?? null
      });
    }

    if (reservation.status === "committed") {
      if (reservation.commitIdempotencyKey === idempotencyKey) {
        return createEnvelope({
          service: QUOTA_SERVICE,
          operation: "commitQuotaReservation",
          traceId: reservation.traceId,
          meta: apiMeta({ tenantId: reservation.tenantId }),
          data: quotaReservationResponseData(reservation, true, "quota.commit")
        });
      }

      return conflictEnvelope(QUOTA_SERVICE, "commitQuotaReservation", "quota_reservation_already_committed", "Quota reservation was already committed.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    if (reservation.status === "released") {
      return conflictEnvelope(QUOTA_SERVICE, "commitQuotaReservation", "quota_reservation_already_released", "Quota reservation was already released.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    const committedAt = new Date().toISOString();
    const traceId = billingTraceId(QUOTA_SERVICE, "commitQuotaReservation");
    const auditEvent = buildBillingAuditEvent({
      action: "quota.commit",
      reason: "quota_committed",
      result: "committed",
      severity: "info",
      target: reservation.id,
      tenantId: reservation.tenantId,
      traceId
    });
    let persisted: { reservation: BillingQuotaReservation; tenant: TenantBillingState };
    try {
      persisted = await this.billingRepository.commitQuotaReservation({
        auditEvent,
        committedAt,
        idempotencyKey,
        reservationId: reservation.id,
        traceId
      });
    } catch {
      return errorEnvelope(QUOTA_SERVICE, "commitQuotaReservation", "quota_reservation_persistence_failed", "Quota reservation commit could not be persisted.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    return createEnvelope({
      service: QUOTA_SERVICE,
      operation: "commitQuotaReservation",
      traceId: persisted.reservation.traceId,
      meta: apiMeta({ tenantId: persisted.reservation.tenantId }),
      data: {
        ...quotaReservationResponseData(persisted.reservation, false, "quota.commit"),
        tenant: tenantSummary(persisted.tenant)
      }
    });
  }

  async releaseQuotaReservation(payload: QuotaReservationTransitionPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const idempotencyKey = request.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return invalidEnvelope(QUOTA_SERVICE, "releaseQuotaReservation", "idempotency_key_required", "Quota reservation release requires an idempotency key.", {
        reservationId: request.reservationId ?? null
      });
    }

    const reservation = await this.billingRepository.findQuotaReservation(request.reservationId);
    if (!reservation) {
      return notFoundEnvelope(QUOTA_SERVICE, "releaseQuotaReservation", "quota_reservation_not_found", `Quota reservation ${request.reservationId ?? "(empty)"} was not found.`, {
        reservationId: request.reservationId ?? null
      });
    }

    if (reservation.status === "released") {
      if (reservation.releaseIdempotencyKey === idempotencyKey) {
        return createEnvelope({
          service: QUOTA_SERVICE,
          operation: "releaseQuotaReservation",
          traceId: reservation.traceId,
          meta: apiMeta({ tenantId: reservation.tenantId }),
          data: quotaReservationResponseData(reservation, true, "quota.release")
        });
      }

      return conflictEnvelope(QUOTA_SERVICE, "releaseQuotaReservation", "quota_reservation_already_released", "Quota reservation was already released.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    if (reservation.status === "committed") {
      return conflictEnvelope(QUOTA_SERVICE, "releaseQuotaReservation", "quota_reservation_already_committed", "Quota reservation was already committed.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    let persisted: BillingQuotaReservation;
    const releasedAt = new Date().toISOString();
    const traceId = billingTraceId(QUOTA_SERVICE, "releaseQuotaReservation");
    const auditEvent = buildBillingAuditEvent({
      action: "quota.release",
      reason: "quota_released",
      result: "released",
      severity: "info",
      target: reservation.id,
      tenantId: reservation.tenantId,
      traceId
    });
    try {
      persisted = await this.billingRepository.releaseQuotaReservation({
        auditEvent,
        idempotencyKey,
        releasedAt,
        reservationId: reservation.id,
        traceId
      });
    } catch {
      return errorEnvelope(QUOTA_SERVICE, "releaseQuotaReservation", "quota_reservation_persistence_failed", "Quota reservation release could not be persisted.", {
        reservationId: reservation.id,
        tenantId: reservation.tenantId
      });
    }

    return createEnvelope({
      service: QUOTA_SERVICE,
      operation: "releaseQuotaReservation",
      traceId: persisted.traceId,
      meta: apiMeta({ tenantId: persisted.tenantId }),
      data: quotaReservationResponseData(persisted, false, "quota.release")
    });
  }

  async fetchTenantQuotaSnapshot(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenant = await this.findTenant(tenantId);

    if (!tenant) {
      return notFoundEnvelope(QUOTA_SERVICE, "fetchTenantQuotaSnapshot", "tenant_not_found", `Tenant ${tenantId} was not found.`, { tenantId });
    }

    const tariff = await this.findTariff(tenant.planId);
    const quotaResources = ["operators", "users", "workspaces", "webhooks", "storage", "ai", "bots", "reports", "channels"];
    const quotas = await Promise.all(quotaResources.map(async (resource) => {
      const reserved = await this.activeReservedAmount(tenant.id, resource);
      return quotaMetric(tenant, tariff, resource, reserved);
    }));

    return createEnvelope({
      service: QUOTA_SERVICE,
      operation: "fetchTenantQuotaSnapshot",
      traceId: billingTraceId(QUOTA_SERVICE, "fetchTenantQuotaSnapshot"),
      partial: true,
      meta: apiMeta({ tenantId }),
      data: {
        quotas: quotas.filter((metric): metric is QuotaMetric => Boolean(metric)),
        tariff: tariff ? clone(tariff) : null,
        tenant: tenantSummary(tenant)
      }
    });
  }

  async fetchTenantSubscription(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenant = await this.findTenant(tenantId);

    if (!tenant) {
      return notFoundEnvelope(BILLING_SERVICE, "fetchTenantSubscription", "tenant_not_found", `Tenant ${tenantId} was not found.`, { tenantId });
    }

    const subscription = await this.billingRepository.findTenantSubscription(tenant.id);
    const tariff = await this.findTariff(subscription?.planId ?? tenant.planId);

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "fetchTenantSubscription",
      traceId: billingTraceId(BILLING_SERVICE, "fetchTenantSubscription"),
      meta: apiMeta({ tenantId: tenant.id }),
      data: {
        entitlementPlanId: tenant.planId,
        providerPlanId: subscription?.planId ?? null,
        subscription: subscription ? sanitizeSubscription(subscription) : null,
        tariff: tariff ? clone(tariff) : null,
        tenant: tenantSummary(tenant)
      }
    });
  }

  async fetchTenantInvoices(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenant = await this.findTenant(tenantId);

    if (!tenant) {
      return notFoundEnvelope(BILLING_SERVICE, "fetchTenantInvoices", "tenant_not_found", `Tenant ${tenantId} was not found.`, { tenantId });
    }

    const invoices = await this.billingRepository.listTenantInvoices(tenant.id);

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "fetchTenantInvoices",
      traceId: billingTraceId(BILLING_SERVICE, "fetchTenantInvoices"),
      meta: apiMeta({ tenantId: tenant.id }),
      data: {
        items: invoices.map(sanitizeInvoice),
        paymentSummary: paymentSummary(invoices),
        tenant: tenantSummary(tenant)
      }
    });
  }

  async syncProviderBillingState(payload: ProviderSyncPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenant = await this.findTenant(request.tenantId);

    if (!tenant) {
      return notFoundEnvelope(BILLING_SERVICE, "syncProviderBillingState", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    const provider = normalizeProvider(request.provider);
    const eventType = normalizeProviderEventType(request.eventType);
    const idempotencyKey = request.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "idempotency_key_required", "Provider billing sync requires an idempotency key.", {
        tenantId: tenant.id
      });
    }

    if (!eventType) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "provider_event_type_required", "Provider billing sync requires an event type.", {
        idempotencyKey,
        tenantId: tenant.id
      });
    }

    const now = new Date().toISOString();
    const requestFingerprint = providerSyncFingerprint({
      eventType,
      invoice: request.invoice,
      provider,
      subscription: request.subscription,
      tenantId: tenant.id
    });
    const cached = await this.billingRepository.findProviderSyncEventByIdempotencyKey(idempotencyKey);

    if (cached) {
      if (cached.requestFingerprint !== requestFingerprint) {
        return conflictEnvelope(BILLING_SERVICE, "syncProviderBillingState", "billing_provider_sync_idempotency_key_reused", "Provider billing sync idempotency key was already used for a different payload.", {
          idempotencyKey,
          tenantId: tenant.id
        });
      }

      let updatedEvent: BillingProviderSyncEvent | undefined;
      try {
        updatedEvent = await this.billingRepository.appendProviderSyncAuditEvent(
          cached.idempotencyKey,
          providerSyncAuditEvent(cached, "duplicate")
        );
      } catch {
        updatedEvent = undefined;
      }
      if (!updatedEvent) {
        return errorEnvelope(BILLING_SERVICE, "syncProviderBillingState", "billing_provider_sync_audit_persistence_failed", "Provider billing sync replay audit could not be persisted.", {
          idempotencyKey,
          queue: "billing-sync",
          tenantId: tenant.id
        });
      }

      return createEnvelope({
        service: BILLING_SERVICE,
        operation: "syncProviderBillingState",
        traceId: cached.traceId,
        meta: apiMeta({ tenantId: tenant.id }),
        data: providerSyncResponseData({
          duplicate: true,
          event: updatedEvent,
          invoice: recordOrNull(updatedEvent.payload.invoice),
          subscription: recordOrNull(updatedEvent.payload.subscription),
          syncJobId: updatedEvent.syncJobId
        })
      });
    }

    const traceId = billingTraceId(BILLING_SERVICE, "syncProviderBillingState");
    const subscription = normalizeSubscriptionSync(request.subscription, tenant, provider, now);
    const invoice = normalizeInvoiceSync(request.invoice, tenant, subscription, provider, now);
    if (requiresPaymentActionApproval(provider, eventType)) {
      const approvalValidation = await this.validatePaymentActionApproval({
        approvalId: request.approvalId,
        eventType,
        invoice,
        provider,
        tenantId: tenant.id,
        traceId
      });
      if (approvalValidation) {
        return approvalValidation;
      }
    }
    const syncJobId = makeQueueId("billing_sync");
    const event: BillingProviderSyncEvent = {
      auditEvents: [],
      createdAt: now,
      eventType,
      id: makeQueueId("provider_sync"),
      idempotencyKey,
      payload: {
        approvalId: request.approvalId ?? null,
        eventType,
        invoice: invoice ? sanitizeInvoice(invoice) : null,
        provider,
        subscription: subscription ? sanitizeSubscription(subscription) : null,
        tenantId: tenant.id
      },
      provider,
      requestFingerprint,
      status: "accepted",
      syncJobId,
      tenantId: tenant.id,
      traceId
    };
    event.auditEvents = [providerSyncAuditEvent(event, "accepted")];
    const tenantChanges = providerTenantChanges(tenant, subscription);
    const nextPlanId = subscription?.planId ?? tenant.planId;
    const syncJob: BillingSyncJob = {
      actor: "billing-provider",
      actorName: provider,
      attempts: 0,
      auditEventId: event.id,
      createdAt: now,
      deadLetteredAt: null,
      fromPlanId: tenant.planId,
      id: syncJobId,
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      payload: {
        approvalId: request.approvalId ?? null,
        eventType,
        idempotencyKey,
        invoiceId: invoice?.id ?? null,
        provider,
        providerInvoiceId: invoice?.providerInvoiceId ?? null,
        providerSubscriptionId: subscription?.providerSubscriptionId ?? null,
        subscriptionId: subscription?.id ?? null,
        tenantId: tenant.id
      },
      publishedAt: null,
      queue: "billing-sync",
      reason: eventType,
      status: "pending",
      tenantId: tenant.id,
      toPlanId: nextPlanId,
      traceId
    };
    const paymentRetrySchedule = invoice
      ? paymentRetryScheduleForProviderEvent({
        eventType,
        idempotencyKey,
        invoice,
        now,
        provider,
        requestFingerprint,
        tenantId: tenant.id,
        traceId
      })
      : undefined;
    const paymentDunningState = invoice
      ? paymentDunningStateForProviderEvent({
        eventType,
        idempotencyKey,
        invoice,
        now,
        provider,
        requestFingerprint,
        tenantId: tenant.id,
        traceId
      })
      : undefined;
    const paymentRetryKey = invoice && paymentRetrySchedule
      ? paymentRetryKeyForProviderEvent({
        idempotencyKey,
        invoice,
        now,
        provider,
        requestFingerprint,
        scheduleId: paymentRetrySchedule.scheduleId,
        tenantId: tenant.id,
        traceId
      })
      : undefined;
    const reconciliationConflict = invoice
      ? reconciliationConflictForProviderEvent({
        idempotencyKey,
        invoice,
        now,
        provider,
        requestFingerprint,
        tenantId: tenant.id,
        traceId
      })
      : undefined;

    let persisted: {
      event: BillingProviderSyncEvent;
      invoice?: BillingInvoiceState;
      paymentDunningState?: BillingPaymentDunningState;
      paymentRetryKey?: BillingPaymentRetryKey;
      paymentRetrySchedule?: BillingPaymentRetrySchedule;
      reconciliationConflict?: BillingReconciliationConflict;
      subscription?: BillingSubscriptionState;
      syncJob: BillingSyncJob;
      tenant: TenantBillingState;
    };
    try {
      persisted = await this.billingRepository.applyProviderBillingSync({
        event,
        ...(invoice ? { invoice } : {}),
        ...(paymentDunningState ? { paymentDunningState } : {}),
        ...(paymentRetryKey ? { paymentRetryKey } : {}),
        ...(paymentRetrySchedule ? { paymentRetrySchedule } : {}),
        ...(reconciliationConflict ? { reconciliationConflict } : {}),
        ...(subscription ? { subscription } : {}),
        syncJob,
        tenantChanges,
        tenantId: tenant.id
      });
    } catch {
      return errorEnvelope(BILLING_SERVICE, "syncProviderBillingState", "billing_provider_sync_persistence_failed", "Provider billing sync could not be persisted.", {
        idempotencyKey,
        queue: "billing-sync",
        tenantId: tenant.id
      });
    }

    return createEnvelope({
      service: BILLING_SERVICE,
      operation: "syncProviderBillingState",
      traceId,
      meta: apiMeta({ tenantId: tenant.id }),
      data: providerSyncResponseData({
        duplicate: false,
        event: persisted.event,
        invoice: persisted.invoice ? sanitizeInvoice(persisted.invoice) : null,
        subscription: persisted.subscription ? sanitizeSubscription(persisted.subscription) : null,
        syncJobId: persisted.syncJob.id
      })
    });
  }

  private async validateTariffApproval(input: {
    approvalId?: string;
    auditBase: {
      action: string;
      actor: string;
      actorName: string;
      at: string;
      from: string;
      immutable: true;
      reason: string | undefined;
      severity: "critical";
      target: string;
      tenantId: string;
      traceId: string;
      to: string;
    };
    currentPlanId: string;
    nextPlanId: string;
    preview: Record<string, unknown>;
    tenantId: string;
  }): Promise<BackendEnvelope<Record<string, unknown>> | undefined> {
    const approvalId = String(input.approvalId ?? "").trim();
    const approval = await this.billingRepository.findBillingApproval(approvalId, input.tenantId);
    const commonData = {
      applied: false,
      approval: input.preview.approval,
      approvalId,
      auditEvent: {
        id: makeAuditId("billing_tariff"),
        ...input.auditBase
      },
      capacityCheck: input.preview.capacityCheck,
      confirmation: input.preview.confirmation,
      tenantId: input.tenantId
    };

    if (!approval) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "approval_not_found", "A matching billing approval decision was not found.", {
        ...commonData,
        auditEvent: {
          ...commonData.auditEvent,
          result: "blocked_approval_not_found"
        }
      });
    }

    const expectedSubjectId = tariffApprovalSubjectId(input.tenantId, input.currentPlanId, input.nextPlanId);
    if (approval.subjectType !== "tariff_change" || approval.subjectId !== expectedSubjectId) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "approval_subject_mismatch", "Billing approval does not match the requested tariff change.", {
        ...commonData,
        auditEvent: {
          ...commonData.auditEvent,
          result: "blocked_approval_subject_mismatch"
        },
        expectedSubjectId,
        subjectId: approval.subjectId,
        subjectType: approval.subjectType
      });
    }

    if (approval.status !== "approved") {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "approval_not_approved", "Billing approval must be approved before applying this tariff change.", {
        ...commonData,
        auditEvent: {
          ...commonData.auditEvent,
          result: "blocked_approval_not_approved"
        },
        approvalStatus: approval.status
      });
    }

    if (isExpiredApproval(approval)) {
      return invalidEnvelope(BILLING_SERVICE, "changeTenantTariff", "approval_expired", "Billing approval has expired.", {
        ...commonData,
        auditEvent: {
          ...commonData.auditEvent,
          result: "blocked_approval_expired"
        },
        expiresAt: approval.expiresAt
      });
    }

    return undefined;
  }

  private async validatePaymentActionApproval(input: {
    approvalId?: string;
    eventType: string;
    invoice: BillingInvoiceState | undefined;
    provider: string;
    tenantId: string;
    traceId: string;
  }): Promise<BackendEnvelope<Record<string, unknown>> | undefined> {
    if (!input.invoice) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_invoice_required", "Manual payment action requires invoice payload.", {
        applied: false,
        eventType: input.eventType,
        provider: input.provider,
        tenantId: input.tenantId
      });
    }

    const approvalId = String(input.approvalId ?? "").trim();
    if (!approvalId) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_approval_required", "Approval is required before applying a manual payment action.", {
        applied: false,
        eventType: input.eventType,
        invoiceId: input.invoice.id,
        provider: input.provider,
        tenantId: input.tenantId
      });
    }

    const approval = await this.billingRepository.findBillingApproval(approvalId, input.tenantId);
    const commonData = {
      applied: false,
      approvalId,
      eventType: input.eventType,
      invoiceId: input.invoice.id,
      provider: input.provider,
      tenantId: input.tenantId,
      traceId: input.traceId
    };

    if (!approval) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_approval_not_found", "A matching payment approval decision was not found.", commonData);
    }

    const expectedSubjectId = paymentActionApprovalSubjectId(input.tenantId, input.invoice.id, input.eventType);
    if (approval.subjectType !== "payment_action" || approval.subjectId !== expectedSubjectId) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_approval_subject_mismatch", "Payment approval does not match the requested payment action.", {
        ...commonData,
        expectedSubjectId,
        subjectId: approval.subjectId,
        subjectType: approval.subjectType
      });
    }

    if (approval.status !== "approved") {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_approval_not_approved", "Payment approval must be approved before applying this payment action.", {
        ...commonData,
        approvalStatus: approval.status
      });
    }

    if (isExpiredApproval(approval)) {
      return invalidEnvelope(BILLING_SERVICE, "syncProviderBillingState", "payment_approval_expired", "Payment approval has expired.", {
        ...commonData,
        expiresAt: approval.expiresAt
      });
    }

    return undefined;
  }

  private async findTariff(planId: string | undefined): Promise<BillingTariff | undefined> {
    return this.billingRepository.findTariff(planId);
  }

  private async findTenant(tenantId: string | undefined): Promise<TenantBillingState | undefined> {
    return this.billingRepository.findTenant(tenantId);
  }

  private async activeReservedAmount(tenantId: string, resource: string): Promise<number> {
    const reservations = await this.billingRepository.listQuotaReservations({
      resource,
      statuses: ["reserved"],
      tenantId
    });
    return reservations.reduce((sum, reservation) => sum + reservation.requested, 0);
  }

  private async recordQuotaLedgerDecision(input: {
    data: Record<string, unknown>;
    mode: "record";
    requested: number;
    resource: string;
    tariff: BillingTariff | undefined;
    tenant: TenantBillingState;
    traceId: string;
  }, request: QuotaCheckPayload): Promise<{
    data: Record<string, unknown>;
    kind: "fresh";
  } | {
    envelope: BackendEnvelope<Record<string, unknown>>;
    kind: "error";
  }> {
    const idempotencyKey = request.idempotencyKey?.trim();
    if (!idempotencyKey) {
      return {
        kind: "error",
        envelope: invalidEnvelope(QUOTA_SERVICE, "checkQuota", "idempotency_key_required", "A quota ledger record requires an idempotency key.", {
          mode: input.mode,
          tenantId: input.tenant.id
        })
      };
    }

    const requestFingerprint = quotaRecordFingerprint({
      mode: input.mode,
      requested: input.requested,
      resource: input.resource,
      tenantId: input.tenant.id
    });
    const cached = await this.billingRepository.findQuotaLedgerEntryByIdempotencyKey(idempotencyKey);

    if (cached) {
      if (cached.requestFingerprint !== requestFingerprint) {
        return {
          kind: "error",
          envelope: conflictEnvelope(QUOTA_SERVICE, "checkQuota", "idempotency_key_reused", "Idempotency key was already used for a different quota record request.", {
            idempotencyKey,
            tenantId: input.tenant.id
          })
        };
      }

      return {
        kind: "fresh",
        data: quotaLedgerResponseData(cached, true)
      };
    }

    const decision = input.data.decision === "allow" ? "allow" : "deny";
    const auditEvent: BillingAuditEvent = {
      action: "quota.record",
      actor: "quota-service",
      actorName: "Quota Service",
      at: new Date().toISOString(),
      id: makeAuditId("billing_quota"),
      immutable: true,
      reason: decision === "deny" ? "quota_exceeded" : "quota_recorded",
      result: decision,
      severity: decision === "deny" ? "warning" : "info",
      target: input.resource,
      tenantId: input.tenant.id,
      traceId: input.traceId
    };
    const remainingBefore = Number(input.data.remaining);
    const remainingAfter = decision === "allow"
      ? Math.max(0, Number(input.data.limit) - Number(input.data.projected))
      : remainingBefore;
    const entry: BillingQuotaLedgerEntry = {
      auditEvent,
      createdAt: new Date().toISOString(),
      decision,
      id: makeQueueId("quota"),
      idempotencyKey,
      limit: Number(input.data.limit),
      mode: input.mode,
      planId: input.tariff?.id ?? input.tenant.planId,
      projected: Number(input.data.projected),
      reason: decision === "deny" ? "quota_exceeded" : null,
      remainingAfter,
      remainingBefore,
      requested: input.requested,
      requestFingerprint,
      resource: input.resource,
      tenantId: input.tenant.id,
      traceId: input.traceId,
      used: Number(input.data.used)
    };

    let persisted: BillingQuotaLedgerEntry;
    try {
      persisted = await this.billingRepository.recordQuotaLedgerEntry(entry);
    } catch {
      return {
        kind: "error",
        envelope: errorEnvelope(QUOTA_SERVICE, "checkQuota", "quota_ledger_persistence_failed", "Quota ledger decision could not be persisted.", {
          idempotencyKey,
          mode: input.mode,
          tenantId: input.tenant.id
        })
      };
    }

    return {
      kind: "fresh",
      data: quotaLedgerResponseData(persisted, false)
    };
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function billingTraceId(service: string, operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(service, operation);
}

function buildBillingAuditEvent({
  action,
  reason,
  result,
  severity,
  target,
  tenantId,
  traceId
}: {
  action: string;
  reason: string;
  result: string;
  severity: BillingAuditEvent["severity"];
  target: string;
  tenantId: string;
  traceId: string;
}): BillingAuditEvent {
  return {
    action,
    actor: "quota-service",
    actorName: "Quota Service",
    at: new Date().toISOString(),
    id: makeAuditId("billing_quota"),
    immutable: true,
    reason,
    result,
    severity,
    target,
    tenantId,
    traceId
  };
}

function buildTariffPreview(
  tenant: TenantBillingState,
  currentTariff: BillingTariff | undefined,
  nextTariff: BillingTariff,
  reason: string | undefined
): Record<string, unknown> {
  const capacityCheck = {
    seatDelta: nextTariff.includedUsers - tenant.users,
    users: tenant.users <= nextTariff.includedUsers ? "ok" : "over_limit",
    workspaceDelta: nextTariff.workspaceLimit - tenant.workspaces,
    workspaces: tenant.workspaces <= nextTariff.workspaceLimit ? "ok" : "over_limit"
  };
  const downgrade = currentTariff ? nextTariff.priceMonthly < currentTariff.priceMonthly : false;
  const overLimit = capacityCheck.users === "over_limit" || capacityCheck.workspaces === "over_limit";

  return {
    approval: {
      providedReason: reason?.trim() ?? "",
      reason: overLimit ? "Target tariff capacity is below current tenant usage." : downgrade ? "Downgrade requires manager approval." : "Tariff change requires audit approval.",
      required: downgrade || overLimit
    },
    annualizedDelta: ((nextTariff.priceMonthly - (currentTariff?.priceMonthly ?? 0)) * 12),
    capacityCheck,
    confirmation: {
      expectedText: confirmationText(tenant.id, nextTariff.id),
      required: true
    },
    currentTariff: currentTariff ? clone(currentTariff) : null,
    monthlyDelta: nextTariff.priceMonthly - (currentTariff?.priceMonthly ?? 0),
    nextTariff: clone(nextTariff),
    tenant: tenantSummary(tenant)
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function confirmationText(tenantId: string, planId: string): string {
  return `CHANGE ${tenantId} TO ${planId}`;
}

function tariffApprovalSubjectId(tenantId: string, currentPlanId: string, nextPlanId: string): string {
  return `${tenantId}:${currentPlanId}:${nextPlanId}`;
}

function paymentActionApprovalSubjectId(tenantId: string, invoiceId: string, eventType: string): string {
  return `${tenantId}:${invoiceId}:${eventType}`;
}

function requiresPaymentActionApproval(provider: string, eventType: string): boolean {
  return provider === "manual-payment-override" || eventType === "invoice.payment_override";
}

function conflictEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: billingTraceId(service, operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function errorEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: billingTraceId(service, operation),
    status: "error",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function hasAuditReason(reason: unknown): boolean {
  return String(reason ?? "").trim().length >= 8;
}

function isExpiredApproval(approval: BillingApproval): boolean {
  return new Date(approval.expiresAt).getTime() <= Date.now();
}

function invalidEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: billingTraceId(service, operation),
    status: "invalid",
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

function providerSyncAuditEvent(event: BillingProviderSyncEvent, result: BillingProviderSyncAuditEvent["result"]): BillingProviderSyncAuditEvent {
  return {
    action: result === "duplicate" ? "billing.provider_sync.duplicate" : "billing.provider_sync.accepted",
    at: new Date().toISOString(),
    eventId: event.id,
    eventType: event.eventType,
    id: makeAuditId("billing_provider_sync"),
    idempotencyKey: event.idempotencyKey,
    immutable: true,
    provider: event.provider,
    result,
    syncJobId: event.syncJobId,
    tenantId: event.tenantId,
    traceId: event.traceId
  };
}

function normalizeRequested(requested: unknown): number {
  const value = Number(requested);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeResource(resource: string | undefined): string {
  const value = String(resource ?? "").trim().toLowerCase();
  if (value === "operator") {
    return "operators";
  }
  if (value === "webhook") {
    return "webhooks";
  }
  if (value === "workspace") {
    return "workspaces";
  }
  if (value === "user") {
    return "users";
  }
  return value || "operators";
}

function normalizeQuotaMode(mode: unknown): "check" | "record" | undefined {
  const value = String(mode ?? "").trim().toLowerCase();
  if (!value) {
    return "check";
  }

  return value === "check" || value === "record" ? value : undefined;
}

function notFoundEnvelope(service: string, operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service,
    operation,
    traceId: billingTraceId(service, operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function quotaLedgerResponseData(entry: BillingQuotaLedgerEntry, duplicate: boolean): Record<string, unknown> {
  return {
    ...(entry.auditEvent ? { auditEvent: entry.auditEvent } : {}),
    decision: entry.decision,
    duplicate,
    idempotencyKey: entry.idempotencyKey,
    limit: entry.limit,
    mode: entry.mode,
    planId: entry.planId,
    projected: entry.projected,
    quotaLedgerEntryId: entry.id,
    remaining: entry.remainingBefore,
    remainingAfter: entry.remainingAfter,
    remainingBefore: entry.remainingBefore,
    requested: entry.requested,
    resource: entry.resource,
    tenantId: entry.tenantId,
    used: entry.used
  };
}

function quotaReservationResponseData(reservation: BillingQuotaReservation, duplicate: boolean, auditAction?: string): Record<string, unknown> {
  const auditEvent = auditAction
    ? reservation.auditEvents?.find((event) => event.action === auditAction) ?? reservation.auditEvent
    : reservation.auditEvent;

  return {
    ...(auditEvent ? { auditEvent } : {}),
    commitIdempotencyKey: reservation.commitIdempotencyKey,
    committedAt: reservation.committedAt,
    duplicate,
    expiresAt: reservation.expiresAt,
    idempotencyKey: reservation.idempotencyKey,
    limit: reservation.limit,
    planId: reservation.planId,
    releaseIdempotencyKey: reservation.releaseIdempotencyKey,
    releasedAt: reservation.releasedAt,
    requested: reservation.requested,
    reservationId: reservation.id,
    resource: reservation.resource,
    status: reservation.status,
    tenantId: reservation.tenantId,
    usedAfter: reservation.usedAfter,
    usedBefore: reservation.usedBefore
  };
}

function quotaMetric(tenant: TenantBillingState, tariff: BillingTariff | undefined, resource: string, reserved = 0): QuotaMetric | undefined {
  const metrics: Record<string, { limit: number; used: number }> = {
    ai: { used: tenant.usage.aiTokens, limit: tariff?.aiTokens ?? 0 },
    bots: { used: tenant.usage.botRuns, limit: tariff?.botRuns ?? 0 },
    channels: { used: tenant.usage.channels, limit: tariff?.workspaceLimit ?? 0 },
    operators: { used: tenant.usage.operators, limit: tariff?.includedUsers ?? 0 },
    reports: { used: tenant.usage.reportExports, limit: tariff?.reportExports ?? 0 },
    storage: { used: tenant.usage.storageGb, limit: tariff?.storageGb ?? 0 },
    users: { used: tenant.users, limit: tariff?.includedUsers ?? 0 },
    webhooks: { used: tenant.usage.webhooks, limit: tariff?.webhookLimit ?? 0 },
    workspaces: { used: tenant.workspaces, limit: tariff?.workspaceLimit ?? 0 }
  };
  const metric = metrics[resource];

  if (!metric) {
    return undefined;
  }

  return {
    available: Math.max(0, metric.limit - metric.used - reserved),
    resource,
    used: metric.used,
    limit: metric.limit,
    remaining: Math.max(0, metric.limit - metric.used),
    reserved,
    status: metric.used <= metric.limit ? "ok" : "over_limit"
  };
}

function quotaRecordFingerprint(input: {
  mode: "record";
  requested: number;
  resource: string;
  tenantId: string;
}): string {
  return JSON.stringify({
    mode: input.mode,
    requested: input.requested,
    resource: input.resource,
    tenantId: input.tenantId
  });
}

function quotaReservationFingerprint(input: {
  requested: number;
  resource: string;
  tenantId: string;
}): string {
  return JSON.stringify({
    mode: "reserve",
    requested: input.requested,
    resource: input.resource,
    tenantId: input.tenantId
  });
}

function normalizeProvider(provider: string | undefined): string {
  return String(provider ?? "demo-billing-provider").trim() || "demo-billing-provider";
}

function normalizeProviderEventType(eventType: string | undefined): string | undefined {
  const value = String(eventType ?? "").trim();
  return value || undefined;
}

function normalizeSubscriptionSync(
  subscription: Partial<BillingSubscriptionState> | undefined,
  tenant: TenantBillingState,
  provider: string,
  now: string
): BillingSubscriptionState | undefined {
  if (!subscription) {
    return undefined;
  }

  const id = stringOrDefault(subscription.id, `sub_${tenant.id}_${provider}`);
  const planId = stringOrDefault(subscription.planId, tenant.planId);

  return {
    billingPeriod: subscription.billingPeriod === "annual" ? "annual" : "monthly",
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    createdAt: isoOrDefault(subscription.createdAt, now),
    currency: normalizeCurrency(subscription.currency),
    currentPeriodEnd: isoOrDefault(subscription.currentPeriodEnd, now),
    currentPeriodStart: isoOrDefault(subscription.currentPeriodStart, now),
    id,
    planId,
    provider,
    providerCustomerId: stringOrDefault(subscription.providerCustomerId, `provider-customer-${tenant.id}`),
    providerSubscriptionId: stringOrDefault(subscription.providerSubscriptionId, id),
    seats: positiveIntegerOrDefault(subscription.seats, tenant.users),
    status: normalizeSubscriptionStatus(subscription.status),
    tenantId: tenant.id,
    unitAmountMonthly: positiveIntegerOrDefault(subscription.unitAmountMonthly, tenant.monthlyRevenue),
    updatedAt: isoOrDefault(subscription.updatedAt, now)
  };
}

function normalizeInvoiceSync(
  invoice: Partial<BillingInvoiceState> | undefined,
  tenant: TenantBillingState,
  subscription: BillingSubscriptionState | undefined,
  provider: string,
  now: string
): BillingInvoiceState | undefined {
  if (!invoice) {
    return undefined;
  }

  const id = stringOrDefault(invoice.id, `inv_${tenant.id}_${provider}`);
  const amountDue = nonNegativeIntegerOrDefault(invoice.amountDue, subscription?.unitAmountMonthly ?? tenant.monthlyRevenue);
  const amountPaid = nonNegativeIntegerOrDefault(invoice.amountPaid, 0);

  return {
    amountDue,
    amountPaid,
    createdAt: isoOrDefault(invoice.createdAt, now),
    currency: normalizeCurrency(invoice.currency),
    dueAt: isoOrDefault(invoice.dueAt, now),
    hostedInvoiceUrl: stringOrNull(invoice.hostedInvoiceUrl),
    id,
    paidAt: invoice.paidAt ? isoOrDefault(invoice.paidAt, now) : null,
    paymentStatus: normalizePaymentStatus(invoice.paymentStatus),
    provider,
    providerInvoiceId: stringOrDefault(invoice.providerInvoiceId, id),
    status: normalizeInvoiceStatus(invoice.status),
    subscriptionId: stringOrNull(invoice.subscriptionId) ?? subscription?.id ?? null,
    tenantId: tenant.id,
    updatedAt: isoOrDefault(invoice.updatedAt, now)
  };
}

function providerTenantChanges(tenant: TenantBillingState, subscription: BillingSubscriptionState | undefined): Partial<TenantBillingState> {
  if (!subscription) {
    return {};
  }

  const changes: Partial<TenantBillingState> = {};
  if (subscription.planId !== tenant.planId) {
    changes.planId = subscription.planId;
  }
  if (subscription.unitAmountMonthly !== tenant.monthlyRevenue) {
    changes.monthlyRevenue = subscription.unitAmountMonthly;
    changes.arr = subscription.unitAmountMonthly * 12;
  }

  return changes;
}

function paymentRetryScheduleForProviderEvent(input: {
  eventType: string;
  idempotencyKey: string;
  invoice: BillingInvoiceState;
  now: string;
  provider: string;
  requestFingerprint: string;
  tenantId: string;
  traceId: string;
}): BillingPaymentRetrySchedule | undefined {
  if (input.eventType !== "invoice.payment_failed" && input.invoice.paymentStatus !== "failed") {
    return undefined;
  }

  const scheduleId = `payment-retry:${input.tenantId}:${input.provider}:${input.invoice.providerInvoiceId}`;
  return {
    attempt: 1,
    createdAt: input.now,
    idempotencyKey: `${scheduleId}:${input.idempotencyKey}`,
    invoiceId: input.invoice.id,
    lastAttemptAt: null,
    maxAttempts: 4,
    nextAttemptAt: new Date(new Date(input.now).getTime() + 15 * 60 * 1000).toISOString(),
    provider: input.provider,
    providerInvoiceId: input.invoice.providerInvoiceId,
    requestFingerprint: input.requestFingerprint,
    scheduleId,
    status: "scheduled",
    tenantId: input.tenantId,
    traceId: input.traceId,
    updatedAt: input.now
  };
}

function paymentRetryKeyForProviderEvent(input: {
  idempotencyKey: string;
  invoice: BillingInvoiceState;
  now: string;
  provider: string;
  requestFingerprint: string;
  scheduleId: string;
  tenantId: string;
  traceId: string;
}): BillingPaymentRetryKey {
  const retryKeyId = `payment-retry-key:${input.tenantId}:${input.provider}:${input.invoice.providerInvoiceId}:attempt-1`;
  return {
    attempt: 1,
    createdAt: input.now,
    firstAttemptAt: input.now,
    idempotencyKey: `${retryKeyId}:${input.idempotencyKey}`,
    invoiceId: input.invoice.id,
    lastAttemptAt: null,
    provider: input.provider,
    providerInvoiceId: input.invoice.providerInvoiceId,
    requestFingerprint: input.requestFingerprint,
    result: {
      action: "schedule_retry",
      scheduleId: input.scheduleId
    },
    retryKeyId,
    scheduleId: input.scheduleId,
    status: "claimed",
    tenantId: input.tenantId,
    traceId: input.traceId,
    updatedAt: input.now
  };
}

function paymentDunningStateForProviderEvent(input: {
  eventType: string;
  idempotencyKey: string;
  invoice: BillingInvoiceState;
  now: string;
  provider: string;
  requestFingerprint: string;
  tenantId: string;
  traceId: string;
}): BillingPaymentDunningState | undefined {
  if (input.eventType !== "invoice.payment_failed" && input.invoice.paymentStatus !== "failed") {
    return undefined;
  }

  const dunningId = `payment-dunning:${input.tenantId}:${input.provider}:${input.invoice.providerInvoiceId}`;
  return {
    createdAt: input.now,
    dunningId,
    failedAttempts: 1,
    idempotencyKey: `${dunningId}:${input.idempotencyKey}`,
    invoiceId: input.invoice.id,
    lastFailureAt: input.now,
    nextActionAt: null,
    provider: input.provider,
    providerInvoiceId: input.invoice.providerInvoiceId,
    requestFingerprint: input.requestFingerprint,
    stage: "initial",
    status: "active",
    subscriptionId: input.invoice.subscriptionId,
    tenantId: input.tenantId,
    traceId: input.traceId,
    updatedAt: input.now
  };
}

function reconciliationConflictForProviderEvent(input: {
  idempotencyKey: string;
  invoice: BillingInvoiceState;
  now: string;
  provider: string;
  requestFingerprint: string;
  tenantId: string;
  traceId: string;
}): BillingReconciliationConflict | undefined {
  const paidInvoiceMismatch = input.invoice.status === "paid"
    && (input.invoice.paymentStatus !== "succeeded" || input.invoice.amountPaid < input.invoice.amountDue);
  if (!paidInvoiceMismatch) {
    return undefined;
  }

  const conflictId = `reconciliation-conflict:${input.tenantId}:${input.provider}:${input.invoice.providerInvoiceId}`;
  return {
    actual: {
      amountPaid: input.invoice.amountPaid,
      paymentStatus: input.invoice.paymentStatus,
      status: input.invoice.status
    },
    conflictId,
    createdAt: input.now,
    detectedAt: input.now,
    expected: {
      amountPaid: input.invoice.amountDue,
      paymentStatus: "succeeded",
      status: "paid"
    },
    idempotencyKey: `${conflictId}:${input.idempotencyKey}`,
    invoiceId: input.invoice.id,
    provider: input.provider,
    providerInvoiceId: input.invoice.providerInvoiceId,
    reason: "provider_invoice_status_mismatch",
    requestFingerprint: input.requestFingerprint,
    resolution: null,
    resolvedAt: null,
    severity: "high",
    status: "open",
    tenantId: input.tenantId,
    traceId: input.traceId,
    updatedAt: input.now
  };
}

function providerSyncFingerprint(input: {
  eventType: string;
  invoice: Partial<BillingInvoiceState> | undefined;
  provider: string;
  subscription: Partial<BillingSubscriptionState> | undefined;
  tenantId: string;
}): string {
  return JSON.stringify({
    eventType: input.eventType,
    invoice: input.invoice ? invoiceFingerprintData(input.invoice) : null,
    provider: input.provider,
    subscription: input.subscription ? subscriptionFingerprintData(input.subscription) : null,
    tenantId: input.tenantId
  });
}

function subscriptionFingerprintData(subscription: Partial<BillingSubscriptionState>): Record<string, unknown> {
  return {
    billingPeriod: subscription.billingPeriod ?? null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? null,
    currency: subscription.currency ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    currentPeriodStart: subscription.currentPeriodStart ?? null,
    id: subscription.id ?? null,
    planId: subscription.planId ?? null,
    provider: subscription.provider ?? null,
    providerCustomerId: subscription.providerCustomerId ?? null,
    providerSubscriptionId: subscription.providerSubscriptionId ?? null,
    seats: subscription.seats ?? null,
    status: subscription.status ?? null,
    tenantId: subscription.tenantId ?? null,
    unitAmountMonthly: subscription.unitAmountMonthly ?? null
  };
}

function invoiceFingerprintData(invoice: Partial<BillingInvoiceState>): Record<string, unknown> {
  return {
    amountDue: invoice.amountDue ?? null,
    amountPaid: invoice.amountPaid ?? null,
    currency: invoice.currency ?? null,
    dueAt: invoice.dueAt ?? null,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? null,
    id: invoice.id ?? null,
    paidAt: invoice.paidAt ?? null,
    paymentStatus: invoice.paymentStatus ?? null,
    provider: invoice.provider ?? null,
    providerInvoiceId: invoice.providerInvoiceId ?? null,
    status: invoice.status ?? null,
    subscriptionId: invoice.subscriptionId ?? null,
    tenantId: invoice.tenantId ?? null
  };
}

function providerSyncResponseData(input: {
  duplicate: boolean;
  event: BillingProviderSyncEvent;
  invoice: Record<string, unknown> | null;
  subscription: Record<string, unknown> | null;
  syncJobId: string;
}): Record<string, unknown> {
  return {
    duplicate: input.duplicate,
    event: {
      eventType: input.event.eventType,
      id: input.event.id,
      idempotencyKey: input.event.idempotencyKey,
      provider: input.event.provider,
      status: input.event.status,
      tenantId: input.event.tenantId
    },
    invoice: input.invoice,
    queue: "billing-sync",
    subscription: input.subscription,
    syncJobId: input.syncJobId
  };
}

function paymentSummary(invoices: BillingInvoiceState[]): Record<string, unknown> {
  const amountsByCurrency = [...invoices.reduce((groups, invoice) => {
    const current = groups.get(invoice.currency) ?? { currency: invoice.currency, invoiceCount: 0, openAmount: 0, paidAmount: 0 };
    current.invoiceCount += 1;
    current.paidAmount += invoice.amountPaid;
    if (invoice.status === "open" || invoice.status === "past_due") {
      current.openAmount += Math.max(0, invoice.amountDue - invoice.amountPaid);
    }
    groups.set(invoice.currency, current);
    return groups;
  }, new Map<string, { currency: string; invoiceCount: number; openAmount: number; paidAmount: number }>()).values()]
    .sort((left, right) => left.currency.localeCompare(right.currency));
  const aggregate = amountsByCurrency.length === 1 ? amountsByCurrency[0] : null;

  return {
    amountsByCurrency,
    currency: aggregate?.currency ?? (invoices.length === 0 ? "RUB" : null),
    invoiceCount: invoices.length,
    openAmount: aggregate?.openAmount ?? (invoices.length === 0 ? 0 : null),
    paidAmount: aggregate?.paidAmount ?? (invoices.length === 0 ? 0 : null)
  };
}

function sanitizeSubscription(subscription: BillingSubscriptionState): Record<string, unknown> {
  return clone(subscription) as unknown as Record<string, unknown>;
}

function sanitizeInvoice(invoice: BillingInvoiceState): Record<string, unknown> {
  return clone(invoice) as unknown as Record<string, unknown>;
}

function isoOrDefault(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function normalizeCurrency(value: unknown): string {
  const currency = String(value ?? "RUB").trim().toUpperCase();
  return currency || "RUB";
}

function normalizeSubscriptionStatus(value: unknown): BillingSubscriptionState["status"] {
  const status = String(value ?? "active").trim();
  return status === "active" || status === "trialing" || status === "past_due" || status === "canceled" || status === "paused" ? status : "active";
}

function normalizeInvoiceStatus(value: unknown): BillingInvoiceState["status"] {
  const status = String(value ?? "open").trim();
  return status === "draft" || status === "open" || status === "paid" || status === "past_due" || status === "void" || status === "uncollectible" ? status : "open";
}

function normalizePaymentStatus(value: unknown): BillingInvoiceState["paymentStatus"] {
  const status = String(value ?? "pending").trim();
  return status === "pending" || status === "succeeded" || status === "failed" || status === "refunded" || status === "none" ? status : "pending";
}

function nonNegativeIntegerOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function stringOrDefault(value: unknown, fallback: string): string {
  const stringValue = String(value ?? "").trim();
  return stringValue || fallback;
}

function stringOrNull(value: unknown): string | null {
  const stringValue = String(value ?? "").trim();
  return stringValue || null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function tenantSummary(tenant: TenantBillingState): Record<string, unknown> {
  return {
    arr: tenant.arr,
    healthScore: tenant.healthScore,
    id: tenant.id,
    monthlyRevenue: tenant.monthlyRevenue,
    name: tenant.name,
    owner: tenant.owner,
    planId: tenant.planId,
    region: tenant.region,
    sla: tenant.sla,
    status: tenant.status,
    users: tenant.users,
    workspaces: tenant.workspaces
  };
}
