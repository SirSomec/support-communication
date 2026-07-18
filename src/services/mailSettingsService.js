import { apiRequest } from "./apiClient.js";

const SERVICE = "mailSettingsService";

// Служебная почта — платформенная настройка: доступна только администратору
// сервиса (authMode service-admin), распространяется на рассылки всех
// воркспейсов.
export const mailSettingsService = {
  async fetchMailSettings() {
    return apiRequest("/service-admin/mail-settings", {
      authMode: "service-admin",
      operation: "fetchMailSettings",
      service: SERVICE
    });
  },

  async saveMailSettings(payload = {}) {
    return apiRequest("/service-admin/mail-settings", {
      authMode: "service-admin",
      body: payload,
      method: "PUT",
      operation: "saveMailSettings",
      service: SERVICE
    });
  },

  async sendTestEmail(payload = {}) {
    return apiRequest("/service-admin/mail-settings/test", {
      authMode: "service-admin",
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
