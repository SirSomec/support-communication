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

  async fetchSources() {
    return apiRequest("/knowledge-sources", {
      operation: "fetchKnowledgeSources",
      service: SERVICE
    });
  },

  async createSource(payload = {}) { return apiRequest("/knowledge-sources", { body: payload, method: "POST", operation: "createKnowledgeSource", service: SERVICE }); },
  async refreshSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/refresh`, { method: "POST", operation: "refreshKnowledgeSource", service: SERVICE }); },
  async refreshDocumentSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/refresh-document`, { method: "POST", operation: "refreshKnowledgeSourceDocument", service: SERVICE }); },
  async approveSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/approve`, { method: "POST", operation: "approveKnowledgeSource", service: SERVICE }); },
  async updateSource(sourceId, payload = {}) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}`, { body: payload, method: "PATCH", operation: "updateKnowledgeSource", service: SERVICE }); },
  async disableSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/disable`, { method: "POST", operation: "disableKnowledgeSource", service: SERVICE }); },
  async enableSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/enable`, { method: "POST", operation: "enableKnowledgeSource", service: SERVICE }); },
  async archiveSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/archive`, { method: "POST", operation: "archiveKnowledgeSource", service: SERVICE }); },
  async deleteSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}`, { method: "DELETE", operation: "removeKnowledgeSource", service: SERVICE }); },
  async previewSource(sourceId) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/preview`, { operation: "previewKnowledgeSource", service: SERVICE }); },
  async enqueueSourceAttachment(sourceId, payload = {}) { return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}/attachments`, { body: payload, method: "POST", operation: "enqueueKnowledgeAttachmentIngestion", service: SERVICE }); },
  async searchSources(payload = {}) { return apiRequest("/knowledge-retrieval/query", { body: payload, method: "POST", operation: "retrieveKnowledgePreview", service: SERVICE }); },
  async fetchUnansweredQuestions() { return apiRequest("/knowledge/unanswered-questions", { operation: "fetchUnansweredQuestions", service: SERVICE }); },
  async dismissUnansweredQuestion(questionId) { return apiRequest(`/knowledge/unanswered-questions/${encodeURIComponent(questionId)}/dismiss`, { method: "POST", operation: "dismissUnansweredQuestion", service: SERVICE }); },
  async resolveUnansweredQuestion(questionId, payload = {}) { return apiRequest(`/knowledge/unanswered-questions/${encodeURIComponent(questionId)}/resolve`, { body: payload, method: "POST", operation: "resolveUnansweredQuestion", service: SERVICE }); },

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
        "fetchSources",
        "updateSource",
        "disableSource",
        "enableSource",
        "archiveSource",
        "deleteSource",
        "previewSource",
        "searchSources",
        "fetchUnansweredQuestions",
        "dismissUnansweredQuestion",
        "resolveUnansweredQuestion",
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
