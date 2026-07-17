import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { type ServiceAdminActor } from "../identity/service-admin-auth.js";
import {
  buildFeatureFlagPreviewRollout,
  evaluateFeatureFlagRollout,
  featureFlagToRolloutRule
} from "./feature-flag-rollout.engine.js";
import type { FeatureFlag, PlatformTenant } from "../platform/platform.types.js";
import { PlatformRepository } from "../platform/platform.repository.js";
import {
  buildPlatformAuditIdempotencyKey,
  makeEphemeralPlatformMutationIdempotencyKey,
  persistPlatformRolloutMutationAsync
} from "../platform/platform-audit-outbox.js";

const FEATURE_FLAG_SERVICE = "featureFlagService";

interface FeatureFlagFilters {
  query?: string;
  scope?: string;
  status?: string;
}

interface FeatureFlagChangePayload {
  actor?: ServiceAdminActor;
  confirmationText?: string;
  confirmed?: boolean;
  flagId?: string;
  idempotencyKey?: string;
  nextRollout?: unknown;
  nextStatus?: FeatureFlag["status"];
  reason?: string;
  tenantIds?: string[];
}

interface InternalFlagTestPayload {
  flagId?: string;
  segment?: string;
  tenantId?: string;
}

export class FeatureFlagService {
  constructor(private readonly platformRepository = PlatformRepository.default()) {}

  private listFlags(): Promise<FeatureFlag[]> {
    return this.platformRepository.listFeatureFlagsAsync();
  }

  private listTenants() {
    return this.platformRepository.listPlatformTenantsAsync();
  }

  async fetchFeatureFlags(filters: FeatureFlagFilters = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const query = String(filters.query ?? "").trim().toLowerCase();
    const items = (await this.listFlags()).filter((flag) => {
      const statusMatches = !filters.status || filters.status === "all" || flag.status === filters.status;
      const scopeMatches = !filters.scope || filters.scope === "all" || flag.scope === filters.scope;
      const queryMatches = !query || [flag.key, flag.name, flag.owner].some((value) => value.toLowerCase().includes(query));
      return statusMatches && scopeMatches && queryMatches;
    });

    return createEnvelope({
      service: FEATURE_FLAG_SERVICE,
      operation: "fetchFeatureFlags",
      traceId: flagTraceId("fetchFeatureFlags"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        filters,
        items: clone(items),
        tenants: (await this.listTenants()).map(({ id, name, planId, status }) => ({ id, name, planId, status }))
      }
    });
  }

  async previewFlagChange(payload: FeatureFlagChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope("previewFlagChange", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        flagId: request.flagId ?? null,
        reason: request.reason ?? null
      });
    }

    if (!isSupportedFlagStatus(request.nextStatus)) {
      return invalidEnvelope("previewFlagChange", "flag_status_unsupported", "Feature flag status is not supported.", {
        flagId: request.flagId ?? null,
        status: request.nextStatus ?? null
      });
    }
    if (!isSupportedRollout(request.nextRollout)) {
      return invalidEnvelope("previewFlagChange", "flag_rollout_invalid", "Feature flag rollout must be a number from 0 to 100.", {
        flagId: request.flagId ?? null,
        rollout: request.nextRollout ?? null
      });
    }

    const flag = await this.findFlag(request.flagId ?? "");
    if (!flag) {
      return notFoundEnvelope("previewFlagChange", "flag_not_found", `Feature flag ${request.flagId ?? "(empty)"} was not found.`, {
        flagId: request.flagId ?? null
      });
    }

    const tenants = await this.listTenants();
    const unknownTenantIds = findUnknownTenantIds(request.tenantIds, tenants);
    if (unknownTenantIds.length) {
      return invalidEnvelope("previewFlagChange", "flag_tenant_not_found", "Feature flag rollout contains unknown tenant ids.", {
        flagId: flag.id,
        tenantIds: unknownTenantIds
      });
    }
    return createEnvelope({
      service: FEATURE_FLAG_SERVICE,
      operation: "previewFlagChange",
      traceId: flagTraceId("previewFlagChange"),
      meta: apiMeta({ flagId: flag.id }),
      data: {
        ...buildFlagPreview({
          flag,
          nextRollout: request.nextRollout,
          nextStatus: request.nextStatus,
          reason: request.reason,
          tenantIds: request.tenantIds ?? [],
          tenants
        }),
        rolloutEvaluation: buildFeatureFlagPreviewRollout({
          rule: buildPreviewRule(flag, request),
          tenants: tenants.map(({ id, planId }) => ({ id, planId }))
        })
      }
    });
  }

  async updateFeatureFlag(payload: FeatureFlagChangePayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!hasAuditReason(request.reason)) {
      return invalidEnvelope("updateFeatureFlag", "reason_required", "A service-admin reason of at least 8 characters is required.", {
        flagId: request.flagId ?? null,
        reason: request.reason ?? null
      });
    }

    if (!isSupportedFlagStatus(request.nextStatus)) {
      return invalidEnvelope("updateFeatureFlag", "flag_status_unsupported", "Feature flag status is not supported.", {
        flagId: request.flagId ?? null,
        status: request.nextStatus ?? null
      });
    }
    if (!isSupportedRollout(request.nextRollout)) {
      return invalidEnvelope("updateFeatureFlag", "flag_rollout_invalid", "Feature flag rollout must be a number from 0 to 100.", {
        flagId: request.flagId ?? null,
        rollout: request.nextRollout ?? null
      });
    }

    const flag = await this.findFlag(request.flagId ?? "");
    if (!flag) {
      return notFoundEnvelope("updateFeatureFlag", "flag_not_found", `Feature flag ${request.flagId ?? "(empty)"} was not found.`, {
        flagId: request.flagId ?? null
      });
    }

    const tenants = await this.listTenants();
    const unknownTenantIds = findUnknownTenantIds(request.tenantIds, tenants);
    if (unknownTenantIds.length) {
      return invalidEnvelope("updateFeatureFlag", "flag_tenant_not_found", "Feature flag rollout contains unknown tenant ids.", {
        flagId: flag.id,
        tenantIds: unknownTenantIds
      });
    }
    const preview = buildFlagPreview({
      flag,
      nextRollout: request.nextRollout,
      nextStatus: request.nextStatus,
      reason: request.reason,
      tenantIds: request.tenantIds ?? [],
      tenants
    });
    const confirmation = preview.confirmation as { expectedText: string; required: boolean };
    const confirmationValid = request.confirmed && (!confirmation.required || request.confirmationText === confirmation.expectedText);

    if (!confirmationValid) {
      return invalidEnvelope("updateFeatureFlag", "confirmation_required", confirmation.required
        ? `Type ${confirmation.expectedText} to confirm flag change.`
        : "Explicit confirmation is required to update feature flags.", {
        ...preview,
        applied: false,
        auditEvent: auditEvent("feature_flag.update", flag.key, request.reason, request.actor, "blocked")
      });
    }

    const traceId = flagTraceId("updateFeatureFlag");
    const mutationIdempotencyKey = isNonEmptyString(request.idempotencyKey)
      ? request.idempotencyKey.trim()
      : makeEphemeralPlatformMutationIdempotencyKey(`rollout-${flag.id}`);
    let outcome: {
      duplicate: boolean;
      flag: FeatureFlag;
      mutationPersistence: Awaited<ReturnType<typeof persistPlatformRolloutMutationAsync>>;
      outbox: Awaited<ReturnType<PlatformRepository["saveFeatureFlagOutboxAsync"]>> | null;
    };
    try {
      outcome = await this.platformRepository.runInTransaction(`platform:feature-flag:${flag.id}`, async (repository) => {
        const currentFlag = (await repository.listFeatureFlagsAsync()).find((item) => item.id === flag.id || item.key === flag.key);
        if (!currentFlag) {
          throw new Error(`feature_flag_not_found_during_transaction:${flag.id}`);
        }
        const nextFlag: FeatureFlag = {
          ...currentFlag,
          enabledTenantIds: request.tenantIds?.length ? request.tenantIds : currentFlag.enabledTenantIds,
          rollout: normalizeRollout(request.nextRollout, currentFlag.rollout),
          status: request.nextStatus ?? currentFlag.status,
          updatedAt: new Date().toISOString()
        };
        const auditIdempotencyKey = buildPlatformAuditIdempotencyKey("rollout", mutationIdempotencyKey, nextFlag.key);
        const duplicate = Boolean(await repository.findPlatformAuditRowAsync(auditIdempotencyKey));
        const mutationPersistence = await persistPlatformRolloutMutationAsync({
          actor: request.actor,
          enabledTenantIds: request.tenantIds?.length ? request.tenantIds : undefined,
          flagKey: nextFlag.key,
          idempotencyKey: mutationIdempotencyKey,
          idempotencyPayload: {
            nextRollout: request.nextRollout === undefined ? null : Number(request.nextRollout),
            nextStatus: request.nextStatus ?? null,
            tenantIds: request.tenantIds?.length ? [...new Set(request.tenantIds)].sort() : []
          },
          reason: String(request.reason).trim(),
          repository,
          rollout: nextFlag.rollout,
          status: nextFlag.status,
          traceId
        });
        if (duplicate) {
          return { duplicate, flag: currentFlag, mutationPersistence, outbox: null };
        }

        const persistedFlag = await repository.saveFeatureFlagAsync(nextFlag);
        await repository.saveFeatureFlagRuleAsync(buildPreviewRule(persistedFlag, request));
        const outbox = await repository.saveFeatureFlagOutboxAsync({
          id: mutationPersistence.outbox?.id ?? makeQueueId("feature_flag_rollout"),
          queue: "feature-flag-rollout",
          target: persistedFlag.key
        });
        return { duplicate, flag: persistedFlag, mutationPersistence, outbox };
      });
    } catch (error) {
      if (isPlatformIdempotencyConflict(error)) {
        return conflictEnvelope("updateFeatureFlag", "idempotency_key_reused", "Idempotency key was already used for a different feature flag rollout.", {
          flagId: flag.id,
          idempotencyKey: request.idempotencyKey ?? null
        });
      }

      throw error;
    }
    Object.assign(flag, outcome.flag);

    return createEnvelope({
      service: FEATURE_FLAG_SERVICE,
      operation: "updateFeatureFlag",
      traceId,
      meta: apiMeta({ flagId: flag.id }),
      data: {
        ...preview,
        applied: true,
        duplicate: outcome.duplicate,
        auditEvent: auditEvent("feature_flag.update", flag.key, request.reason, request.actor, "queued"),
        flag: clone(outcome.flag),
        outbox: outcome.outbox,
        platformAudit: outcome.mutationPersistence.audit,
        platformOutbox: outcome.mutationPersistence.outbox
      }
    });
  }

  async runInternalFlagTest(payload: InternalFlagTestPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const flag = await this.findFlag(request.flagId ?? "");

    if (!flag) {
      return notFoundEnvelope("runInternalFlagTest", "flag_not_found", `Feature flag ${request.flagId ?? "(empty)"} was not found.`, {
        flagId: request.flagId ?? null
      });
    }

    const tenant = (await this.listTenants()).find((item) => item.id === request.tenantId);

    if (!tenant) {
      return notFoundEnvelope("runInternalFlagTest", "tenant_not_found", `Tenant ${request.tenantId ?? "(empty)"} was not found.`, {
        tenantId: request.tenantId ?? null
      });
    }

    const segment = request.segment ?? tenant.planId;
    const rule = (await this.platformRepository.listFeatureFlagRulesAsync({ flagId: flag.id }))[0] ?? featureFlagToRolloutRule(flag);
    const evaluation = evaluateFeatureFlagRollout({
      planId: tenant.planId,
      rule,
      segment,
      tenantId: tenant.id
    });

    return createEnvelope({
      service: FEATURE_FLAG_SERVICE,
      operation: "runInternalFlagTest",
      traceId: flagTraceId("runInternalFlagTest"),
      meta: apiMeta({ flagId: flag.id, tenantId: tenant.id }),
      data: {
        evaluation: {
          bucket: evaluation.bucket,
          eligible: evaluation.eligible,
          flagKey: flag.key,
          reasons: {
            rollout: evaluation.rollout,
            segmentEligible: evaluation.segmentEligible,
            tenantEligible: evaluation.tenantEligible
          },
          reason: evaluation.reason,
          segment,
          tenantId: tenant.id,
          variant: evaluation.variant
        },
        flag: clone(flag)
      }
    });
  }

  private async findFlag(flagId: string): Promise<FeatureFlag | undefined> {
    return (await this.listFlags()).find((flag) => flag.id === flagId || flag.key === flagId);
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(
  action: string,
  target: string,
  reason: string | undefined,
  actor: ServiceAdminActor | undefined,
  result: "blocked" | "queued"
): Record<string, unknown> {
  return {
    id: makeAuditId("feature_flag"),
    action,
    actor: actor?.id ?? "service-admin",
    actorName: actor?.name ?? "Service Admin",
    immutable: true,
    reason: normalizeReason(reason),
    result,
    target
  };
}

function buildFlagPreview({
  flag,
  nextRollout,
  nextStatus,
  reason,
  tenantIds,
  tenants
}: {
  flag: FeatureFlag;
  nextRollout: unknown;
  nextStatus: FeatureFlag["status"] | undefined;
  reason: string | undefined;
  tenantIds: string[];
  tenants: PlatformTenant[];
}): Record<string, unknown> {
  const rollout = normalizeRollout(nextRollout, flag.rollout);
  const normalizedNextStatus = nextStatus ?? flag.status;
  const selectedTenants = tenantIds.length ? tenants.filter((tenant) => tenantIds.includes(tenant.id)) : [];
  const blastRadius = selectedTenants.length || Math.ceil((tenants.length * rollout) / 100);
  const risky = flag.killSwitch && (rollout === 0 || rollout >= 90 || normalizedNextStatus === "off");

  return {
    blastRadius,
    confirmation: {
      expectedText: `UPDATE ${flag.key}`,
      required: risky
    },
    flag: {
      currentRollout: flag.rollout,
      currentStatus: flag.status,
      id: flag.id,
      key: flag.key,
      name: flag.name
    },
    nextRollout: rollout,
    nextStatus: normalizedNextStatus,
    reason,
    risk: risky ? "requires_confirmation" : "standard_change",
    selectedTenants,
    tenantIds
  };
}

function buildPreviewRule(flag: FeatureFlag, request: FeatureFlagChangePayload): ReturnType<typeof featureFlagToRolloutRule> {
  return featureFlagToRolloutRule({
    ...flag,
    enabledTenantIds: request.tenantIds?.length ? request.tenantIds : flag.enabledTenantIds,
    rollout: normalizeRollout(request.nextRollout, flag.rollout),
    status: request.nextStatus ?? flag.status
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function flagTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(FEATURE_FLAG_SERVICE, operation);
}

function hasAuditReason(reason: unknown): boolean {
  return typeof reason === "string" && reason.trim().length >= 8;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlatformIdempotencyConflict(error: unknown): boolean {
  return error instanceof Error && [
    "platform_audit_idempotency_conflict",
    "platform_outbox_idempotency_conflict"
  ].some((code) => error.message.includes(code));
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: FEATURE_FLAG_SERVICE,
    operation,
    traceId: flagTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: FEATURE_FLAG_SERVICE,
    operation,
    traceId: flagTraceId(operation),
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

function isSupportedFlagStatus(status: FeatureFlag["status"] | undefined): boolean {
  return status === undefined || ["guarded", "gradual", "off", "on"].includes(status);
}

function isSupportedRollout(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function findUnknownTenantIds(tenantIds: string[] | undefined, tenants: PlatformTenant[]): string[] {
  if (!tenantIds?.length) return [];
  const known = new Set(tenants.map((tenant) => tenant.id));
  return [...new Set(tenantIds.map((tenantId) => String(tenantId).trim()).filter(Boolean))]
    .filter((tenantId) => !known.has(tenantId));
}

function normalizeReason(reason: string | undefined): string | null {
  return typeof reason === "string" ? reason.trim() : null;
}

function normalizeRollout(nextRollout: unknown, fallback: number): number {
  const rollout = Number(nextRollout);
  if (!Number.isFinite(rollout)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, rollout));
}

function overlayById<T extends { id: string }>(base: T[], overlay: T[]): T[] {
  const overrides = new Map(overlay.map((item) => [item.id, item]));
  const merged = base.map((item) => overrides.get(item.id) ?? item);
  const extra = overlay.filter((item) => !base.some((baseItem) => baseItem.id === item.id));
  return clone([...extra, ...merged]);
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: FEATURE_FLAG_SERVICE,
    operation,
    traceId: flagTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}
