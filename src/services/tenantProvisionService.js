import { apiRequest } from "./apiClient.js";

const SERVICE = "tenantProvisionService";

export function mapOnboardingFormToProvisionPayload({ admin, plan, tenant }) {
  return {
    tenant: {
      name: tenant.name.trim(),
      slug: tenant.slug.trim(),
      region: tenant.region.trim() || "ru-1"
    },
    admin: {
      name: admin.name.trim(),
      email: admin.email.trim().toLowerCase(),
      password: admin.password
    },
    plan: {
      id: plan.trial ? "trial" : String(plan.id ?? "trial").trim() || "trial",
      trial: Boolean(plan.trial)
    }
  };
}

export const tenantProvisionService = {
  async provisionOrganization(payload) {
    return apiRequest("/tenants/provision", {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "provisionOrganization",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["provisionOrganization"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway tenant provisioning route."
    };
  }
};
