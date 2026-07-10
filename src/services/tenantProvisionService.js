import { apiRequest } from "./apiClient.js";

const SERVICE = "tenantProvisionService";

export function mapOnboardingFormToProvisionPayload({ admin, employees = [], plan, tenant }) {
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
    },
    employees: employees.map((employee) => ({
      email: employee.email,
      ...(employee.name ? { name: employee.name } : {}),
      role: employee.role,
      team: employee.team
    })),
    channel: {
      domain: tenant.slug ? `${tenant.slug}.example.test` : "example.test",
      type: "sdk"
    }
  };
}

export const tenantProvisionService = {
  async provisionOrganization(payload) {
    return apiRequest("/tenants/provision", {
      authMode: "public",
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
