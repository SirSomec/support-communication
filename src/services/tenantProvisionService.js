import { apiRequest } from "./apiClient.js";

const SERVICE = "tenantProvisionService";
export function mapOnboardingFormToProvisionPayload({ admin, legal, limits = {}, plan, tenant }) {
  return {
    tenant: {
      name: tenant.name.trim(),
      slug: tenant.slug.trim(),
      region: tenant.region.trim() || "ru-1",
      industry: String(tenant.industry ?? "").trim()
    },
    admin: {
      name: admin.name.trim(),
      email: admin.email.trim().toLowerCase(),
      password: admin.password,
      role: admin.role,
      mfa: Boolean(admin.mfa)
    },
    plan: {
      id: String(plan.id ?? "free").trim().toLowerCase(),
      billingCycle: "monthly"
    },
    legal: {
      documentVersion: legal.documentVersion,
      personalDataConsent: legal.personalDataConsent === true,
      privacyPolicyAcknowledged: legal.privacyPolicyAcknowledged === true,
      termsAccepted: legal.termsAccepted === true
    },
    channel: {
      domain: String(tenant.domain ?? "").trim().toLowerCase(),
      type: "sdk"
    },
    limits: {
      afterHoursBot: Boolean(limits.afterHoursBot),
      aiAssist: limits.aiAssist !== false,
      concurrentDialogs: Number(limits.concurrentDialogs),
      dailyMessages: Number(limits.dailyMessages),
      operatorLimit: Number(limits.operatorLimit)
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
