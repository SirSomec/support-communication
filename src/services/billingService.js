import { serviceAdminTariffs, serviceAdminTenants } from "../data/serviceAdmin.js";
import { createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "billingService";

export const billingService = {
  async fetchTariffs() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchTariffs",
      data: {
        items: serviceAdminTariffs,
        currency: "RUB",
        billingMode: "monthly",
        previewRequired: true
      }
    });
  },

  async previewTariffChange({ nextPlanId, reason = "", tenantId }) {
    const preview = buildTariffPreview({ nextPlanId, reason, tenantId, operation: "previewTariffChange" });

    if (preview.error) {
      return preview.error;
    }

    return createEnvelope({
      service: SERVICE,
      operation: "previewTariffChange",
      data: preview.data
    });
  },

  async changeTenantTariff({ confirmationText = "", confirmed = false, nextPlanId, reason = "", tenantId }) {
    const preview = buildTariffPreview({ nextPlanId, reason, tenantId, operation: "changeTenantTariff" });

    if (preview.error) {
      return preview.error;
    }

    const confirmationRequired = preview.data.approval.required;
    const typedConfirmationValid = !confirmationRequired || confirmationText === preview.data.confirmation.expectedText;
    const changeConfirmed = confirmed && typedConfirmationValid;

    return createEnvelope({
      service: SERVICE,
      operation: "changeTenantTariff",
      status: changeConfirmed ? "ok" : "invalid",
      error: changeConfirmed ? null : {
        code: "confirmation_required",
        message: confirmationRequired
          ? `Type ${preview.data.confirmation.expectedText} to confirm tariff change.`
          : "Explicit confirmation is required to change tenant tariff."
      },
      data: {
        ...preview.data,
        applied: changeConfirmed,
        auditEvent: {
          id: makeAuditId("billing_tariff"),
          action: "tenant.tariff.change",
          target: tenantId,
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
      operations: ["fetchTariffs", "previewTariffChange", "changeTenantTariff"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "invalid"],
      note: "Billing adapter previews tariff changes before applying audited updates."
    };
  }
};

function buildTariffPreview({ nextPlanId, reason, tenantId, operation }) {
  const tenant = serviceAdminTenants.find((item) => item.id === tenantId);
  const currentTariff = serviceAdminTariffs.find((tariff) => tariff.id === tenant?.planId);
  const nextTariff = serviceAdminTariffs.find((tariff) => tariff.id === nextPlanId);

  if (!hasAuditReason(reason)) {
    return {
      error: createInvalidEnvelope({
        service: SERVICE,
        operation,
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { nextPlanId, reason, tenantId }
      })
    };
  }

  if (!tenant || !currentTariff || !nextTariff) {
    return {
      error: createBackendErrorEnvelope({
        service: SERVICE,
        operation,
        code: "tariff_preview_failed",
        message: "Tenant or tariff was not found."
      })
    };
  }

  const monthlyDelta = nextTariff.priceMonthly - currentTariff.priceMonthly;
  const seatDelta = nextTariff.includedUsers - tenant.users;
  const workspaceDelta = nextTariff.workspaceLimit - tenant.workspaces;
  const isDowngrade = nextTariff.priceMonthly < currentTariff.priceMonthly;
  const approvalRequired = isDowngrade || tenant.users > nextTariff.includedUsers || tenant.workspaces > nextTariff.workspaceLimit;

  return {
    data: {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        users: tenant.users,
        workspaces: tenant.workspaces
      },
      currentTariff,
      nextTariff,
      monthlyDelta,
      annualizedDelta: monthlyDelta * 12,
      capacityCheck: {
        users: seatDelta >= 0 ? "within_limit" : "over_limit",
        workspaces: workspaceDelta >= 0 ? "within_limit" : "over_limit",
        seatDelta,
        workspaceDelta
      },
      approval: {
        required: approvalRequired,
        reason: approvalRequired ? "Downgrade or capacity overage requires confirmation." : "No extra approval required.",
        providedReason: reason
      },
      confirmation: {
        required: approvalRequired,
        expectedText: `CHANGE ${tenant.id} TO ${nextTariff.id}`
      }
    }
  };
}
