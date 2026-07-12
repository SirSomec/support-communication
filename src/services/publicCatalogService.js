import { apiRequest } from "./apiClient.js";

const SERVICE = "publicCatalogService";

export const publicCatalogService = {
  fetchHealth() {
    return apiRequest("/health", {
      authMode: "public",
      operation: "fetchHealth",
      service: SERVICE
    });
  },

  fetchTariffs() {
    return apiRequest("/public/catalog/tariffs", {
      authMode: "public",
      operation: "fetchTariffs",
      service: SERVICE
    });
  }
};
