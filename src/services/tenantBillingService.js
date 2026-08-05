import { apiRequest } from "./apiClient.js";

export const tenantBillingService = {
  fetchOverview() {
    return apiRequest("/tenant/billing/overview", {
      operation: "fetchTenantBillingOverview",
      service: "tenantBillingService"
    });
  },
  fetchOperatorLimit() {
    return apiRequest("/settings/billing/operator-limit", {
      operation: "fetchSettingsOperatorLimit",
      service: "tenantBillingService"
    });
  },
  updateOperatorLimit(operatorLimit) {
    return apiRequest("/settings/billing/operator-limit", {
      method: "PATCH",
      body: { operatorLimit },
      operation: "updateSettingsOperatorLimit",
      service: "tenantBillingService"
    });
  },
  purchaseAiDialogPackage({ idempotencyKey, packageId }) {
    return apiRequest("/tenant/billing/ai-dialog-packages/purchases", {
      method: "POST",
      body: { idempotencyKey, packageId },
      operation: "purchaseTenantAiDialogPackage",
      service: "tenantBillingService"
    });
  },
};
