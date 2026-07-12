import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "knowledgeService";

export const knowledgeService = {
  async createArticle(payload = {}) {
    return apiRequest("/knowledge", { body: payload, method: "POST", operation: "createKnowledgeArticle", service: SERVICE });
  },

  async fetchArticles(filters = {}) {
    return apiRequest("/knowledge", {
      operation: "fetchArticles",
      query: filters,
      service: SERVICE
    });
  },

  async fetchArticle(articleId) {
    if (!hasRouteId(articleId)) {
      return missingIdEnvelope("fetchArticle", "Knowledge article id is required.");
    }

    return apiRequest(`/knowledge/${encodeURIComponent(articleId)}`, {
      operation: "fetchArticle",
      service: SERVICE
    });
  },

  async saveArticleDraft(articleId, payload = {}) {
    if (!hasRouteId(articleId)) {
      return missingIdEnvelope("saveArticleDraft", "Knowledge article id is required.");
    }

    return apiRequest(`/knowledge/${encodeURIComponent(articleId)}/drafts`, {
      body: payload,
      method: "POST",
      operation: "saveArticleDraft",
      service: SERVICE
    });
  },

  async submitArticleForReview(articleId, payload = {}) {
    return postArticleWorkflow(articleId, "submit-review", "submitArticleForReview", payload);
  },

  async approveArticle(articleId, payload = {}) {
    return postArticleWorkflow(articleId, "approve", "approveArticle", payload);
  },

  async publishArticle(articleId, payload = {}) {
    return postArticleWorkflow(articleId, "publish", "publishArticle", payload);
  },

  async rejectArticle(articleId, payload = {}) {
    return postArticleWorkflow(articleId, "reject", "rejectArticle", payload);
  },

  async archiveArticle(articleId, payload = {}) {
    return postArticleWorkflow(articleId, "archive", "archiveArticle", payload);
  },

  async addArticleAttachment(articleId, payload = {}) {
    if (!hasRouteId(articleId)) {
      return missingIdEnvelope("addArticleAttachment", "Knowledge article id is required.");
    }

    return apiRequest(`/knowledge/${encodeURIComponent(articleId)}/attachments`, {
      body: payload,
      method: "POST",
      operation: "addArticleAttachment",
      service: SERVICE
    });
  },

  async deleteArticleAttachment({ articleId, attachmentId, reason } = {}) {
    if (!hasRouteId(articleId)) {
      return missingIdEnvelope("deleteArticleAttachment", "Knowledge article id is required.");
    }

    if (!hasRouteId(attachmentId)) {
      return missingIdEnvelope("deleteArticleAttachment", "Knowledge attachment id is required.");
    }

    return apiRequest(`/knowledge/${encodeURIComponent(articleId)}/attachments/${encodeURIComponent(attachmentId)}`, {
      body: { reason },
      method: "DELETE",
      operation: "deleteArticleAttachment",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchArticles",
        "fetchArticle",
        "saveArticleDraft",
        "submitArticleForReview",
        "approveArticle",
        "publishArticle",
        "rejectArticle",
        "archiveArticle",
        "addArticleAttachment",
        "deleteArticleAttachment"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function postArticleWorkflow(articleId, route, operation, payload) {
  if (!hasRouteId(articleId)) {
    return missingIdEnvelope(operation, "Knowledge article id is required.");
  }

  return apiRequest(`/knowledge/${encodeURIComponent(articleId)}/${route}`, {
    body: payload,
    method: "POST",
    operation,
    service: SERVICE
  });
}

function hasRouteId(value) {
  return String(value ?? "").trim().length > 0;
}

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "missing_id",
    message,
    operation,
    service: SERVICE
  });
}
