import { apiRequest } from "./apiClient.js";

const SERVICE = "publicLeadService";

export const publicLeadService = {
  async createDemoRequest(payload = {}) {
    return apiRequest("/public/demo-requests", {
      authMode: "public",
      body: normalizeDemoRequestPayload(payload),
      method: "POST",
      operation: "createDemoRequest",
      service: SERVICE
    });
  }
};

function normalizeDemoRequestPayload(payload = {}) {
  return {
    company: String(payload.company ?? "").trim(),
    consent: payload.consent === true,
    email: String(payload.email ?? "").trim(),
    message: String(payload.message ?? "").trim(),
    name: String(payload.name ?? "").trim(),
    planInterest: String(payload.planInterest ?? "").trim(),
    source: String(payload.source ?? "landing").trim() || "landing",
    website: String(payload.website ?? "").trim()
  };
}
