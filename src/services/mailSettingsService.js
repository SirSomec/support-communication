import { apiRequest } from "./apiClient.js";

const SERVICE = "mailSettingsService";

export const mailSettingsService = {
  async fetchMailSettings() {
    return apiRequest("/workspace/mail-settings", {
      operation: "fetchMailSettings",
      service: SERVICE
    });
  },

  async saveMailSettings(payload = {}) {
    return apiRequest("/workspace/mail-settings", {
      body: payload,
      method: "PUT",
      operation: "saveMailSettings",
      service: SERVICE
    });
  },

  async sendTestEmail(payload = {}) {
    return apiRequest("/workspace/mail-settings/test", {
      body: payload,
      method: "POST",
      operation: "testMailSettings",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchMailSettings", "saveMailSettings", "testMailSettings"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};
