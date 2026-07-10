import { knowledgeService } from "../services/knowledgeService.js";

export async function submitKnowledgeArticleDraft(
  article,
  { saveArticleDraft = knowledgeService.saveArticleDraft } = {}
) {
  const articleId = String(article?.id ?? "").trim();
  if (!articleId) {
    return {
      ok: false,
      message: "Knowledge article id is required."
    };
  }

  const response = await saveArticleDraft(articleId, {
    body: article.body ?? "",
    category: article.category,
    channels: Array.isArray(article.channels) ? article.channels : [],
    reason: article.saveReason ?? `Saved draft from quality workspace for ${article.title ?? articleId}.`,
    title: article.title,
    topics: Array.isArray(article.topics) ? article.topics : [],
    visibility: article.visibility
  });

  if (response?.status !== "ok" || !response.data?.article) {
    return {
      ok: false,
      message: response?.error?.message ?? "Knowledge draft was not saved by the backend."
    };
  }

  return {
    article: response.data.article,
    auditEvent: response.data.auditEvent ?? null,
    ok: true
  };
}

export async function submitKnowledgeArticleForReview(
  article,
  { actor, draftId, reason, submitArticleForReview = knowledgeService.submitArticleForReview } = {}
) {
  return submitKnowledgeGovernanceAction(article, {
    actor,
    defaultReason: `Submitted knowledge article ${articleTitle(article)} for review.`,
    draftId,
    reason,
    request: submitArticleForReview
  });
}

export async function approveKnowledgeArticle(
  article,
  { actor, draftId, reason, approveArticle = knowledgeService.approveArticle } = {}
) {
  return submitKnowledgeGovernanceAction(article, {
    actor,
    defaultReason: `Approved knowledge article ${articleTitle(article)}.`,
    draftId,
    reason,
    request: approveArticle
  });
}

export async function publishKnowledgeArticle(
  article,
  { actor, draftId, reason, publishArticle = knowledgeService.publishArticle } = {}
) {
  return submitKnowledgeGovernanceAction(article, {
    actor,
    defaultReason: `Published knowledge article ${articleTitle(article)}.`,
    draftId,
    reason,
    request: publishArticle
  });
}

export async function rejectKnowledgeArticle(
  article,
  { actor, draftId, reason, rejectArticle = knowledgeService.rejectArticle } = {}
) {
  return submitKnowledgeGovernanceAction(article, {
    actor,
    defaultReason: `Returned knowledge article ${articleTitle(article)} for revision.`,
    draftId,
    reason,
    request: rejectArticle
  });
}

export async function archiveKnowledgeArticle(
  article,
  { actor, draftId, reason, archiveArticle = knowledgeService.archiveArticle } = {}
) {
  return submitKnowledgeGovernanceAction(article, {
    actor,
    defaultReason: `Archived knowledge article ${articleTitle(article)}.`,
    draftId,
    reason,
    request: archiveArticle
  });
}

export async function addKnowledgeArticleAttachment(
  article,
  attachment,
  { actor, addArticleAttachment = knowledgeService.addArticleAttachment, reason } = {}
) {
  const articleId = knowledgeArticleId(article);
  if (!articleId) {
    return {
      ok: false,
      message: "Knowledge article id is required."
    };
  }

  const response = await addArticleAttachment(articleId, {
    actor,
    attachment,
    reason: reason ?? `Added attachment ${attachmentTitle(attachment)} to knowledge article ${articleTitle(article)}.`
  });

  return knowledgeAttachmentActionResult(response, "Knowledge attachment was not added by the backend.");
}

export async function deleteKnowledgeArticleAttachment(
  article,
  attachment,
  { actor, deleteArticleAttachment = knowledgeService.deleteArticleAttachment, reason } = {}
) {
  const articleId = knowledgeArticleId(article);
  const attachmentId = String(attachment?.id ?? attachment?.fileId ?? "").trim();
  if (!articleId) {
    return {
      ok: false,
      message: "Knowledge article id is required."
    };
  }

  if (!attachmentId) {
    return {
      ok: false,
      message: "Knowledge attachment id is required."
    };
  }

  const response = await deleteArticleAttachment({
    actor,
    articleId,
    attachmentId,
    reason: reason ?? `Deleted attachment ${attachmentTitle(attachment)} from knowledge article ${articleTitle(article)}.`
  });

  return knowledgeAttachmentActionResult(response, "Knowledge attachment was not deleted by the backend.");
}

async function submitKnowledgeGovernanceAction(
  article,
  { actor, defaultReason, draftId, reason, request }
) {
  const articleId = knowledgeArticleId(article);
  if (!articleId) {
    return {
      ok: false,
      message: "Knowledge article id is required."
    };
  }

  const response = await request(articleId, {
    actor,
    draftId,
    reason: reason ?? defaultReason
  });

  if (!hasKnowledgeGovernanceEvidence(response)) {
    return {
      ok: false,
      message: response?.error?.message ?? "Knowledge action did not return backend knowledge governance evidence."
    };
  }

  return {
    article: response.data.article,
    approvalDecision: response.data.approvalDecision,
    auditEvent: response.data.auditEvent,
    ok: true
  };
}

function hasKnowledgeGovernanceEvidence(response) {
  return response?.status === "ok"
    && response.data?.article
    && response.data?.approvalDecision?.immutable === true
    && response.data?.auditEvent?.id;
}

function knowledgeAttachmentActionResult(response, fallbackMessage) {
  if (response?.status !== "ok" || !response.data?.article || !response.data?.auditEvent?.id) {
    return {
      ok: false,
      message: response?.error?.message ?? fallbackMessage
    };
  }

  return {
    article: response.data.article,
    attachment: response.data.attachment ?? null,
    auditEvent: response.data.auditEvent,
    ok: true
  };
}

function knowledgeArticleId(article) {
  return String(article?.id ?? "").trim();
}

function articleTitle(article) {
  return String(article?.title ?? article?.id ?? "article").trim() || "article";
}

function attachmentTitle(attachment) {
  return String(attachment?.name ?? attachment?.fileName ?? attachment?.id ?? "attachment").trim() || "attachment";
}
