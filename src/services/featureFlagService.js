import { serviceAdminFeatureFlags, serviceAdminTenants } from "../data/serviceAdmin.js";
import { createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "featureFlagService";

export const featureFlagService = {
  async fetchFeatureFlags(filters = {}) {
    const flags = serviceAdminFeatureFlags.filter((flag) => {
      const statusMatches = !filters.status || filters.status === "all" || flag.status === filters.status;
      const scopeMatches = !filters.scope || filters.scope === "all" || flag.scope === filters.scope;
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [flag.key, flag.name, flag.owner]
        .some((value) => String(value).toLowerCase().includes(query));

      return statusMatches && scopeMatches && queryMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchFeatureFlags",
      data: {
        items: flags,
        tenants: serviceAdminTenants.map(({ id, name, planId, status }) => ({ id, name, planId, status })),
        filters
      },
      partial: true,
      meta: { filters }
    });
  },

  async previewFlagChange({ flagId, nextRollout, nextStatus, reason, tenantIds = [] }) {
    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "previewFlagChange",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { flagId, reason }
      });
    }

    const flag = serviceAdminFeatureFlags.find((item) => item.id === flagId);

    if (!flag) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "previewFlagChange",
        code: "flag_not_found",
        message: `Feature flag ${flagId} was not found.`
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "previewFlagChange",
      data: buildFlagPreview({ flag, nextRollout, nextStatus, reason, tenantIds })
    });
  },

  async updateFeatureFlag({ confirmationText = "", confirmed = false, flagId, nextRollout, nextStatus, reason, tenantIds = [] }) {
    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "updateFeatureFlag",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { flagId, reason }
      });
    }

    const flag = serviceAdminFeatureFlags.find((item) => item.id === flagId);

    if (!flag) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "updateFeatureFlag",
        code: "flag_not_found",
        message: `Feature flag ${flagId} was not found.`
      });
    }

    const preview = buildFlagPreview({ flag, nextRollout, nextStatus, reason, tenantIds });
    const typedConfirmationValid = !preview.confirmation.required || confirmationText === preview.confirmation.expectedText;
    const changeConfirmed = confirmed && typedConfirmationValid;

    return createEnvelope({
      service: SERVICE,
      operation: "updateFeatureFlag",
      status: changeConfirmed ? "ok" : "invalid",
      error: changeConfirmed ? null : {
        code: "confirmation_required",
        message: preview.confirmation.required
          ? `Type ${preview.confirmation.expectedText} to confirm flag change.`
          : "Explicit confirmation is required to update feature flags."
      },
      data: {
        ...preview,
        applied: changeConfirmed,
        flag: {
          ...flag,
          status: nextStatus || flag.status,
          rollout: Number.isFinite(Number(nextRollout)) ? Number(nextRollout) : flag.rollout,
          enabledTenantIds: tenantIds.length ? tenantIds : flag.enabledTenantIds
        },
        auditEvent: {
          id: makeAuditId("feature_flag"),
          action: "feature_flag.update",
          target: flag.key,
          reason,
          immutable: true,
          result: changeConfirmed ? "queued" : "blocked"
        }
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchFeatureFlags", "previewFlagChange", "updateFeatureFlag"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "invalid", "partial"],
      note: "Feature flag adapter supports filtering, rollout preview and audited updates."
    };
  }
};

function buildFlagPreview({ flag, nextRollout, nextStatus, reason, tenantIds }) {
  const rollout = Number.isFinite(Number(nextRollout)) ? Number(nextRollout) : flag.rollout;
  const selectedTenants = tenantIds.length ? serviceAdminTenants.filter((tenant) => tenantIds.includes(tenant.id)) : [];
  const blastRadius = selectedTenants.length || Math.ceil((serviceAdminTenants.length * rollout) / 100);
  const risky = flag.killSwitch && (rollout === 0 || rollout >= 90 || nextStatus === "off");

  return {
    flag: {
      id: flag.id,
      key: flag.key,
      name: flag.name,
      currentStatus: flag.status,
      currentRollout: flag.rollout
    },
    nextStatus: nextStatus || flag.status,
    nextRollout: rollout,
    tenantIds,
    selectedTenants,
    blastRadius,
    reason,
    confirmation: {
      required: risky,
      expectedText: `UPDATE ${flag.key}`
    },
    risk: risky ? "requires_confirmation" : "standard_change"
  };
}
