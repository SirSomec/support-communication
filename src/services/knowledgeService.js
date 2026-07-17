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
  async refreshSource(sourceId) { return sourceRequest(sourceId, "refresh", "refreshKnowledgeSource", { method: "POST" }); },
  async refreshDocumentSource(sourceId) { return sourceRequest(sourceId, "refresh-document", "refreshKnowledgeSourceDocument", { method: "POST" }); },
  async approveSource(sourceId) { return sourceRequest(sourceId, "approve", "approveKnowledgeSource", { method: "POST" }); },
  async approveSources(sourceIds) { return apiRequest("/knowledge-sources/bulk/approve", { body: { sourceIds }, method: "POST", operation: "approveKnowledgeSourcesBulk", service: SERVICE }); },
  async updateSource(sourceId, payload = {}) { return sourceRequest(sourceId, "", "updateKnowledgeSource", { body: payload, method: "PATCH" }); },
  async disableSource(sourceId) { return sourceRequest(sourceId, "disable", "disableKnowledgeSource", { method: "POST" }); },
  async enableSource(sourceId) { return sourceRequest(sourceId, "enable", "enableKnowledgeSource", { method: "POST" }); },
  async archiveSource(sourceId) { return sourceRequest(sourceId, "archive", "archiveKnowledgeSource", { method: "POST" }); },
  async deleteSource(sourceId) { return sourceRequest(sourceId, "", "removeKnowledgeSource", { method: "DELETE" }); },
  async previewSource(sourceId) { return sourceRequest(sourceId, "preview", "previewKnowledgeSource"); },
  async enqueueSourceAttachment(sourceId, payload = {}) { return sourceRequest(sourceId, "attachments", "enqueueKnowledgeAttachmentIngestion", { body: payload, method: "POST" }); },
  async searchSources(payload = {}) { return apiRequest("/knowledge-retrieval/query", { body: payload, method: "POST", operation: "retrieveKnowledgePreview", service: SERVICE }); },
  async fetchMcpConnectors() { return apiRequest("/knowledge-mcp-connectors", { operation: "fetchMcpConnectors", service: SERVICE }); },
  async requestMcpConnector(payload = {}) { return apiRequest("/knowledge-mcp-connectors/requests", { body: payload, method: "POST", operation: "requestMcpConnector", service: SERVICE }); },
  async fetchUnansweredQuestions() { return apiRequest("/knowledge-unanswered-questions", { operation: "fetchUnansweredQuestions", service: SERVICE }); },
  async dismissUnansweredQuestion(questionId) { return questionRequest(questionId, "dismiss", "dismissUnansweredQuestion", { method: "POST" }); },
  async resolveUnansweredQuestion(questionId, payload = {}) { return questionRequest(questionId, "resolve", "resolveUnansweredQuestion", { body: payload, method: "POST" }); },

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
        "fetchMcpConnectors",
        "requestMcpConnector",
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

function sourceRequest(sourceId, route, operation, options = {}) {
  if (!hasRouteId(sourceId)) return missingIdEnvelope(operation, "Knowledge source id is required.");
  const suffix = route ? `/${route}` : "";
  return apiRequest(`/knowledge-sources/${encodeURIComponent(sourceId)}${suffix}`, { ...options, operation, service: SERVICE });
}

function questionRequest(questionId, route, operation, options = {}) {
  if (!hasRouteId(questionId)) return missingIdEnvelope(operation, "Unanswered question id is required.");
  return apiRequest(`/knowledge-unanswered-questions/${encodeURIComponent(questionId)}/${route}`, { ...options, operation, service: SERVICE });
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
