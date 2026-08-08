import { apiRequest } from "./apiClient.js";
const SERVICE = "supportTicketAdminService";
export const supportTicketAdminService = {
  list: (filters = {}) => apiRequest("/service-admin/support-tickets", { authMode: "service-admin", operation: "listServiceSupportTickets", query: filters, service: SERVICE }),
  attachmentDownloadPolicy: (ticketId, fileId) => apiRequest(`/service-admin/support-tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(fileId)}/download-policy`, { authMode: "service-admin", operation: "getServiceSupportAttachmentDownloadPolicy", service: SERVICE }),
  reply: (ticketId, payload) => apiRequest(`/service-admin/support-tickets/${encodeURIComponent(ticketId)}/messages`, { authMode: "service-admin", body: payload, method: "POST", operation: "replyServiceSupportTicket", service: SERVICE }),
  changeStatus: (ticketId, status) => apiRequest(`/service-admin/support-tickets/${encodeURIComponent(ticketId)}/status`, { authMode: "service-admin", body: { status }, method: "PUT", operation: "changeServiceSupportTicketStatus", service: SERVICE })
};
