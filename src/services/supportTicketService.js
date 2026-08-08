import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "supportTicketService";

export const supportTicketService = {
  list: () => apiRequest("/support-tickets", { operation: "listSupportTickets", service: SERVICE }),
  detail: (ticketId) => apiRequest(`/support-tickets/${encodeURIComponent(ticketId)}`, { operation: "getSupportTicket", service: SERVICE }),
  create: (payload) => apiRequest("/support-tickets", { body: payload, method: "POST", operation: "createSupportTicket", service: SERVICE }),
  reply: (ticketId, payload) => apiRequest(`/support-tickets/${encodeURIComponent(ticketId)}/messages`, { body: payload, method: "POST", operation: "replySupportTicket", service: SERVICE }),
  attachmentStatus: (fileId) => apiRequest(`/support-tickets/attachments/${encodeURIComponent(fileId)}/status`, { operation: "getSupportAttachmentStatus", service: SERVICE }),
  async upload(file) {
    if (!(file instanceof File)) return createApiErrorEnvelope({ code: "file_required", message: "Выберите файл.", operation: "uploadSupportAttachment", service: SERVICE });
    const descriptor = await apiRequest("/support-tickets/attachments", { body: { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }, method: "POST", operation: "createSupportUpload", service: SERVICE });
    if (descriptor.status !== "ok") return descriptor;
    const upload = descriptor.data?.signedUpload;
    if (!upload?.url) return createApiErrorEnvelope({ code: "upload_descriptor_invalid", message: "Не удалось подготовить загрузку файла.", operation: "uploadSupportAttachment", service: SERVICE });
    try {
      const response = await fetch(upload.url, { method: upload.method || "PUT", headers: upload.headers || { "content-type": file.type || "application/octet-stream" }, body: file });
      if (!response.ok) throw new Error("upload_failed");
      return apiRequest(`/support-tickets/attachments/${encodeURIComponent(descriptor.data.fileId)}/finalize`, { body: {}, method: "POST", operation: "finalizeSupportUpload", service: SERVICE });
    } catch {
      return createApiErrorEnvelope({ code: "upload_failed", message: "Не удалось загрузить файл. Повторите попытку.", operation: "uploadSupportAttachment", service: SERVICE });
    }
  }
};
