import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkspaceRepository, type KnowledgeArticle } from "../apps/api-gateway/src/workspace/workspace.repository.ts";
import { WorkspaceService } from "../apps/api-gateway/src/workspace/workspace.service.ts";
import { bootstrapWorkspaceState } from "../apps/api-gateway/src/workspace/seed.ts";

describe("knowledge workspace contracts", () => {
  it("lists knowledge articles for tenant workspace reads", async () => {
    const workspace = createWorkspace();
    const articles = await workspace.fetchKnowledgeArticles({}, { tenantId: "tenant-volga" });

    assert.equal(articles.status, "ok");
    assert.ok(Array.isArray(articles.data.items));
  });

  it("rejects knowledge writes without an authenticated tenant context", async () => {
    const workspace = createWorkspace();
    const result = await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "kb-auth-code",
      reason: "Ready for senior knowledge review"
    });

    assert.equal(result.status, "invalid");
    assert.equal(result.error.code, "tenant_context_required");
  });

  it("submits draft articles for backend review and persists approval evidence", async () => {
    const workspace = createWorkspace();

    const review = await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "kb-auth-code",
      reason: "Ready for senior knowledge review"
    }, { tenantId: "tenant-volga" });

    assert.equal(review.status, "ok");
    assert.equal(review.data.article.status, "review");
    assert.equal(review.data.approvalDecision.action, "sent_for_review");
    assert.equal(review.data.approvalDecision.immutable, true);
    assert.match(review.data.auditEvent.id, /^evt_knowledge_/);

    const detail = await workspace.fetchKnowledgeArticle("kb-auth-code", { tenantId: "tenant-volga" });

    assert.equal(detail.data.article.status, "review");
    assert.ok(detail.data.article.approvalHistory.some((event: Record<string, unknown>) => event.action === "sent_for_review"));
  });

  it("publishes reviewed articles and returns them from the public visibility list", async () => {
    const workspace = createWorkspace();

    await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "kb-auth-code",
      reason: "Ready for publication workflow"
    }, { tenantId: "tenant-volga" });

    const published = await workspace.publishKnowledgeArticle({
      actor: "senior-editor",
      articleId: "kb-auth-code",
      reason: "Approved customer-facing instructions"
    }, { tenantId: "tenant-volga" });

    assert.equal(published.status, "ok");
    assert.equal(published.data.article.status, "published");
    assert.equal(published.data.article.visibility, "public");
    assert.equal(published.data.approvalDecision.action, "published");
    assert.equal(published.data.auditEvent.immutable, true);

    const publicArticles = await workspace.fetchKnowledgeArticles({ visibility: "public" }, { tenantId: "tenant-volga" });

    assert.ok(publicArticles.data.items.some((article: KnowledgeArticle) => article.id === "kb-auth-code"));
  });

  it("records approval before publication when senior editor approves an article", async () => {
    const workspace = createWorkspace();

    await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "kb-refund-terms",
      reason: "Ready for approval"
    }, { tenantId: "tenant-volga" });

    const approved = await workspace.approveKnowledgeArticle({
      actor: "senior-editor",
      articleId: "kb-refund-terms",
      reason: "Approved by knowledge owner"
    }, { tenantId: "tenant-volga" });

    assert.equal(approved.status, "ok");
    assert.equal(approved.data.article.status, "approved");
    assert.equal(approved.data.article.visibility, "internal");
    assert.equal(approved.data.approvalDecision.action, "approved");
    assert.equal(approved.data.approvalDecision.immutable, true);
  });

  it("returns reviewed articles to draft with immutable rejection evidence", async () => {
    const workspace = createWorkspace();

    await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "kb-refund-terms",
      reason: "Escalating refund article review"
    }, { tenantId: "tenant-volga" });

    const rejected = await workspace.rejectKnowledgeArticle({
      actor: "senior-editor",
      articleId: "kb-refund-terms",
      reason: "Legal wording must be clarified"
    }, { tenantId: "tenant-volga" });

    assert.equal(rejected.status, "ok");
    assert.equal(rejected.data.article.status, "draft");
    assert.equal(rejected.data.approvalDecision.action, "returned_for_revision");
    assert.equal(rejected.data.approvalDecision.immutable, true);
    assert.ok(rejected.data.article.approvalHistory.some((event: Record<string, unknown>) => event.action === "returned_for_revision"));
  });

  it("blocks publication while article attachments are not clean", async () => {
    const repository = WorkspaceRepository.inMemory();
    await repository.saveKnowledgeArticle({
      ...knowledgeArticleFixture("kb-unsafe-attachment"),
      attachments: [
        { id: "att-scan-pending", name: "scan-pending.pdf", scanState: "scan_pending", status: "scan_pending" }
      ],
      status: "review"
    });
    const workspace = new WorkspaceService(repository);

    const published = await workspace.publishKnowledgeArticle({
      actor: "senior-editor",
      articleId: "kb-unsafe-attachment",
      reason: "Try to publish before scanner clears"
    }, { tenantId: "tenant-volga" });

    assert.equal(published.status, "denied");
    assert.equal(published.error.code, "knowledge_attachment_scan_required");

    const detail = await workspace.fetchKnowledgeArticle("kb-unsafe-attachment", { tenantId: "tenant-volga" });

    assert.equal(detail.data.article.status, "review");
  });

  it("removes article attachment descriptors with audit evidence", async () => {
    const workspace = createWorkspace();

    const removed = await workspace.deleteKnowledgeArticleAttachment({
      actor: "author-anna",
      articleId: "kb-delivery-tracking",
      attachmentId: "att-delivery-map",
      reason: "Outdated attachment replaced"
    }, { tenantId: "tenant-volga" });

    assert.equal(removed.status, "ok");
    assert.equal(removed.data.auditEvent.action, "knowledge.article.attachment.deleted");
    assert.ok(removed.data.article.attachments.every((attachment: Record<string, unknown>) => attachment.id !== "att-delivery-map"));
  });

  it("adds article attachment descriptors with scan policy and audit evidence", async () => {
    const workspace = createWorkspace();

    const added = await workspace.addKnowledgeArticleAttachment({
      actor: "author-anna",
      articleId: "kb-auth-code",
      attachment: {
        fileId: "file_kb_policy",
        name: "policy-update.pdf",
        scanState: "scan_clean",
        scanVerdict: "clean",
        size: "180 KB",
        status: "ready",
        type: "PDF"
      },
      reason: "Policy attachment approved by scanner"
    }, { tenantId: "tenant-volga" });

    assert.equal(added.status, "ok");
    assert.equal(added.data.auditEvent.action, "knowledge.article.attachment.added");
    assert.ok(added.data.article.attachments.some((attachment: Record<string, unknown>) => attachment.name === "policy-update.pdf"));
  });

  it("archives published articles and removes them from public visibility", async () => {
    const workspace = createWorkspace();

    const archived = await workspace.archiveKnowledgeArticle({
      actor: "senior-editor",
      articleId: "kb-delivery-tracking",
      reason: "Article replaced by a newer policy"
    }, { tenantId: "tenant-volga" });

    assert.equal(archived.status, "ok");
    assert.equal(archived.data.article.status, "archived");
    assert.equal(archived.data.approvalDecision.action, "archived");

    const publicArticles = await workspace.fetchKnowledgeArticles({ visibility: "public" }, { tenantId: "tenant-volga" });
    const allArticles = await workspace.fetchKnowledgeArticles({ visibility: "all" }, { tenantId: "tenant-volga" });

    assert.ok(!publicArticles.data.items.some((article: KnowledgeArticle) => article.id === "kb-delivery-tracking"));
    assert.ok(allArticles.data.items.some((article: KnowledgeArticle) => article.id === "kb-delivery-tracking"));
  });

  it("does not mutate articles outside the current tenant", async () => {
    const repository = WorkspaceRepository.inMemory();
    await repository.saveKnowledgeArticle(knowledgeArticleFixture("shared-kb", { tenantId: "tenant-volga", title: "Volga article" }));
    await repository.saveKnowledgeArticle(knowledgeArticleFixture("shared-kb", { tenantId: "tenant-lumen", title: "Lumen article" }));
    const workspace = new WorkspaceService(repository);

    const review = await workspace.submitKnowledgeArticleForReview({
      actor: "author-anna",
      articleId: "shared-kb",
      reason: "Tenant-scoped review"
    }, { tenantId: "tenant-volga" });

    assert.equal(review.status, "ok");

    const volga = await workspace.fetchKnowledgeArticle("shared-kb", { tenantId: "tenant-volga" });
    const lumen = await workspace.fetchKnowledgeArticle("shared-kb", { tenantId: "tenant-lumen" });

    assert.equal(volga.data.article.status, "review");
    assert.equal(lumen.data.article.status, "draft");
  });
});

function createWorkspace(): WorkspaceService {
  return new WorkspaceService(WorkspaceRepository.inMemory(bootstrapWorkspaceState()));
}

function knowledgeArticleFixture(id: string, overrides: Partial<KnowledgeArticle> = {}): KnowledgeArticle {
  return {
    approvalHistory: [],
    attachments: [{ id: "att-ready", name: "ready.pdf", scanState: "scan_clean", status: "ready" }],
    body: "Knowledge article body.",
    category: "Delivery",
    channels: ["SDK"],
    helpfulRate: 80,
    id,
    owner: "Anna R.",
    status: "draft",
    tenantId: "tenant-volga",
    title: "Knowledge article",
    topics: ["Delivery / Status"],
    updated: "2026-07-02T00:00:00.000Z",
    usage: 0,
    version: "v1.0",
    versions: [{ id: `${id}-v1`, label: "v1.0", status: "draft", author: "Anna R.", updated: "2026-07-02T00:00:00.000Z" }],
    visibility: "internal",
    ...overrides
  };
}
