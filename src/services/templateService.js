import { apiRequest } from "./apiClient.js";

const SERVICE = "templateService";

export const templateService = {
  async fetchTemplates(filters = {}) {
    return apiRequest("/templates", {
      operation: "fetchTemplates",
      query: filters,
      service: SERVICE
    });
  },

  async saveTemplate(template = {}) {
    return apiRequest("/templates", {
      body: normalizeTemplatePayload(template),
      method: "POST",
      operation: "saveTemplate",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchTemplates", "saveTemplate"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error"],
      note: "Connected to API Gateway routes."
    };
  }
};

function normalizeTemplatePayload(template) {
  return removeUndefined({
    id: template.id,
    title: template.title,
    text: template.text ?? template.body,
    topic: template.topic,
    channel: template.channel,
    version: template.version
  });
}

function removeUndefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
