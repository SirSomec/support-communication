import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "marketingService";

export const marketingService = {
  getAccessStatus: () => apiRequest("/marketing/access", { operation: "getMarketingAccessStatus", service: SERVICE }),
  fetchWorkspace: () => apiRequest("/marketing/workspace", { operation: "fetchWorkspace", service: SERVICE }),
  getChannelCapabilities: () => apiRequest("/marketing/channel-capabilities", { operation: "getMarketingChannelCapabilities", service: SERVICE }),
  activateModule: (planKey) => apiRequest("/marketing/module/activate", { body: { planKey }, method: "POST", operation: "activateModule", service: SERVICE }),
  createApiKey: () => apiRequest("/marketing/api-key", { method: "POST", operation: "createMarketingApiKey", service: SERVICE }),
  revokeApiKey: (apiKeyId) => apiRequest(`/marketing/api-key/${encodeURIComponent(apiKeyId)}/revoke`, { method: "PATCH", operation: "revokeMarketingApiKey", service: SERVICE }),
  updateSettings: (payload) => apiRequest("/marketing/settings", { body: payload, method: "PATCH", operation: "updateMarketingSettings", service: SERVICE }),
  updateAccess: (userId, enabled) => apiRequest(`/marketing/access/${encodeURIComponent(userId)}`, { body: { enabled }, method: "PATCH", operation: "updateAccess", service: SERVICE }),
  createAudience: (payload) => apiRequest("/marketing/audiences", { body: payload, method: "POST", operation: "createAudience", service: SERVICE }),
  previewAudienceImport: (records) => apiRequest("/marketing/audiences/import-preview", { body: { records }, method: "POST", operation: "previewMarketingAudienceImport", service: SERVICE }),
  archiveAudience: (audienceId) => apiRequest(`/marketing/audiences/${encodeURIComponent(audienceId)}/archive`, { method: "PATCH", operation: "archiveMarketingAudience", service: SERVICE }),
  createAudienceSync: (audienceId) => apiRequest(`/marketing/audiences/${encodeURIComponent(audienceId)}/syncs`, { method: "POST", operation: "createMarketingAudienceCrmSync", service: SERVICE }),
  recordConsent: (payload) => apiRequest("/marketing/consents", { body: payload, method: "POST", operation: "recordMarketingConsent", service: SERVICE }),
  createTemplate: (payload) => apiRequest("/marketing/templates", { body: payload, method: "POST", operation: "createTemplate", service: SERVICE }),
  updateTemplate: (templateId, payload) => apiRequest(`/marketing/templates/${encodeURIComponent(templateId)}`, { body: payload, method: "PATCH", operation: "updateMarketingTemplate", service: SERVICE }),
  createCampaign: (payload) => apiRequest("/marketing/campaigns", { body: payload, method: "POST", operation: "createCampaign", service: SERVICE }),
  updateCampaign: (campaignId, payload) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}`, { body: payload, method: "PATCH", operation: "updateCampaign", service: SERVICE }),
  cloneCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/clone`, { method: "POST", operation: "cloneMarketingCampaign", service: SERVICE }),
  getCampaignAnalytics: () => apiRequest("/marketing/analytics/campaigns", { operation: "getMarketingCampaignAnalytics", service: SERVICE }),
  getCampaignResults: (campaignId, { page = 1, pageSize = 100 } = {}) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/results?page=${encodeURIComponent(page)}&pageSize=${encodeURIComponent(pageSize)}`, { operation: "getMarketingCampaignResults", service: SERVICE }),
  exportCampaignResults: (campaignId, kind, format = "csv") => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/results/export`, { body: { format, kind }, method: "POST", operation: "exportMarketingCampaignResults", service: SERVICE }),
  preflightCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/preflight`, { method: "POST", operation: "preflightMarketingCampaign", service: SERVICE }),
  getClientPreferences: (clientId) => apiRequest(`/marketing/clients/${encodeURIComponent(clientId)}/preferences`, { operation: "getMarketingClientPreferences", service: SERVICE }),
  updateClientChannelRestriction: (clientId, payload) => apiRequest(`/marketing/clients/${encodeURIComponent(clientId)}/channel-restriction`, { body: payload, method: "PATCH", operation: "updateMarketingClientChannelRestriction", service: SERVICE }),
  searchTestRecipients: (query) => apiRequest("/marketing/test-recipients/search", { operation: "searchMarketingTestRecipients", query: { q: query }, service: SERVICE }),
  launchCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/launch`, { headers: { "idempotency-key": crypto.randomUUID() }, method: "POST", operation: "launchCampaign", service: SERVICE }),
  testCampaign: (campaignId, clientIds) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/test`, { body: { clientIds }, headers: { "idempotency-key": crypto.randomUUID() }, method: "POST", operation: "sendMarketingCampaignTest", service: SERVICE }),
  retryFailedCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/retry-failed`, { method: "POST", operation: "retryFailedMarketingCampaignDeliveries", service: SERVICE }),
  pauseCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/pause`, { method: "POST", operation: "pauseCampaign", service: SERVICE }),
  resumeCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/resume`, { method: "POST", operation: "resumeCampaign", service: SERVICE }),
  cancelCampaign: (campaignId) => apiRequest(`/marketing/campaigns/${encodeURIComponent(campaignId)}/cancel`, { method: "POST", operation: "cancelCampaign", service: SERVICE }),
  missingId(operation) { return createApiErrorEnvelope({ code: "missing_id", message: "Campaign id is required.", operation, service: SERVICE }); }
};
