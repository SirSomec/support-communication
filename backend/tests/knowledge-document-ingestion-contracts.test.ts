import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ingestKnowledgeDocument } from "../apps/api-gateway/src/knowledge-sources/document-ingestion.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { KnowledgeSourcesService } from "../apps/api-gateway/src/knowledge-sources/knowledge-sources.service.ts";
import { processOneKnowledgeDocumentIngestion } from "../apps/api-gateway/src/knowledge-sources/document-ingestion.worker.ts";
import { WorkspaceRepository } from "../apps/api-gateway/src/workspace/workspace.repository.ts";

describe("knowledge document ingestion", () => {
  it("normalizes text into bounded chunks with checksum and language", () => {
    const ingested = ingestKnowledgeDocument("Доставка занимает два дня. ".repeat(200), { chunkChars: 400 });
    assert.ok(ingested); assert.equal(ingested?.language, "ru"); assert.match(ingested?.checksum ?? "", /^[a-f0-9]{64}$/);
    assert.ok((ingested?.chunks.length ?? 0) > 1); assert.ok((ingested?.chunks ?? []).every((chunk) => chunk.content.length <= 400));
  });

  it("binds a document source to its published article version and refresh requires a published version", async () => {
    const workspace = WorkspaceRepository.inMemory({
      clientExportJobs: [], clientMergeConflicts: [], clientMergeEvents: [], clientProfiles: [], fileScanResultIdempotency: [], files: [], knowledgeApprovalDecisions: [], knowledgeDraftVersions: [], templateAuditEvents: [], templates: [], templateVersions: [],
      knowledgeArticles: [{ approvalHistory: [], attachments: [], body: "Условия возврата доступны в течение 14 дней.", category: "FAQ", channels: ["SDK"], helpfulRate: 0, id: "article-1", owner: "editor", status: "published", tenantId: "tenant-volga", title: "Возврат", topics: ["return"], updated: "2026-07-12T10:00:00.000Z", usage: 0, version: "v1", versions: [{ id: "v1", label: "v1", status: "published" }], visibility: "public" }]
    });
    const sources = KnowledgeSourceRepository.inMemory(); const service = new KnowledgeSourcesService(sources, workspace);
    const created = await service.create("tenant-volga", { kind: "document", sourceRef: "article-1", title: "Возврат" });
    const source = created.data.source as { approvalStatus: string; metadata: { articleVersion: string; chunks: unknown[] }; readiness: string };
    assert.equal(source.readiness, "ready"); assert.equal(source.approvalStatus, "approved"); assert.equal(source.metadata.articleVersion, "v1"); assert.ok(source.metadata.chunks.length > 0);
    const id = String((created.data.source as { id: string }).id);
    await workspace.saveKnowledgeArticle({ ...(await workspace.findKnowledgeArticle("article-1", { tenantId: "tenant-volga" }))!, status: "draft" });
    const refreshed = await service.refreshDocument("tenant-volga", id);
    assert.equal(refreshed.error?.code, "knowledge_article_not_ready");
  });

  it("persists a repeat-safe ingestion job and worker reads only clean object-storage files", async () => {
    const workspace = WorkspaceRepository.inMemory({ clientExportJobs: [], clientMergeConflicts: [], clientMergeEvents: [], clientProfiles: [], fileScanResultIdempotency: [], knowledgeApprovalDecisions: [], knowledgeArticles: [], knowledgeDraftVersions: [], templateAuditEvents: [], templates: [], templateVersions: [], files: [{ auditId: "audit", channel: "SDK", fileId: "file-worker", fileName: "faq.txt", mimeType: "text/plain", objectKey: "tenant/faq", scanState: "clean", scanVerdict: "clean", sizeBytes: 14, storageState: "uploaded", tenantId: "tenant-volga" }] });
    const sources = KnowledgeSourceRepository.inMemory(); const service = new KnowledgeSourcesService(sources, workspace); const now = "2026-07-12T10:00:00.000Z";
    sources.save({ approvalStatus: "approved", approvedAt: now, approvedBy: "admin", archivedAt: null, contentChecksum: null, createdAt: now, disabledAt: null, failedAt: null, failureCode: null, id: "source-worker", kind: "document", lastIndexedAt: null, lastIngestedAt: null, metadata: {}, owner: "admin", readiness: "not_ready", retentionUntil: null, sourceConfig: {}, sourceRef: null, status: "draft", tenantId: "tenant-volga", title: "Attachment", updatedAt: now, version: 1 });
    const first = await service.enqueueAttachmentIngestion("tenant-volga", "source-worker", { fileId: "file-worker", idempotencyKey: "ingest-1" });
    const duplicate = await service.enqueueAttachmentIngestion("tenant-volga", "source-worker", { fileId: "file-worker", idempotencyKey: "ingest-1" });
    assert.equal(first.status, "ok"); assert.equal(duplicate.data.duplicate, true);
    const processed = await processOneKnowledgeDocumentIngestion({ reader: { read: async () => new TextEncoder().encode("График доставки: ежедневно") }, sources, workspace });
    assert.equal(processed.outcome, "completed");
    const source = sources.find("tenant-volga", "source-worker")!;
    assert.equal(source.status, "ready"); assert.equal(source.approvalStatus, "pending"); assert.equal(source.metadata.extraction, "object_storage_worker");
    assert.equal((sources.findIngestionJob("tenant-volga", "ingest-1")!).status, "completed");
  });

  it("stores a stable machine failure code instead of a transport exception message", async () => {
    const workspace = WorkspaceRepository.inMemory({ clientExportJobs: [], clientMergeConflicts: [], clientMergeEvents: [], clientProfiles: [], fileScanResultIdempotency: [], knowledgeApprovalDecisions: [], knowledgeArticles: [], knowledgeDraftVersions: [], templateAuditEvents: [], templates: [], templateVersions: [], files: [{ auditId: "audit", channel: "SDK", fileId: "file-failing", fileName: "faq.txt", mimeType: "text/plain", objectKey: "tenant/faq", scanState: "clean", scanVerdict: "clean", sizeBytes: 14, storageState: "uploaded", tenantId: "tenant-volga" }] });
    const sources = KnowledgeSourceRepository.inMemory();
    const service = new KnowledgeSourcesService(sources, workspace);
    const now = "2026-07-12T10:00:00.000Z";
    sources.save({ approvalStatus: "approved", approvedAt: now, approvedBy: "admin", archivedAt: null, contentChecksum: null, createdAt: now, disabledAt: null, failedAt: null, failureCode: null, id: "source-failing", kind: "document", lastIndexedAt: null, lastIngestedAt: null, metadata: {}, owner: "admin", readiness: "not_ready", retentionUntil: null, sourceConfig: {}, sourceRef: null, status: "draft", tenantId: "tenant-volga", title: "Attachment", updatedAt: now, version: 1 });
    await service.enqueueAttachmentIngestion("tenant-volga", "source-failing", { fileId: "file-failing", idempotencyKey: "ingest-failing" });

    const processed = await processOneKnowledgeDocumentIngestion({
      reader: { read: async () => { throw new Error("ECONNRESET from object storage host"); } },
      sources,
      workspace
    });

    assert.equal(processed.outcome, "failed");
    assert.equal(sources.find("tenant-volga", "source-failing")?.failureCode, "knowledge_ingestion_failed");
    assert.equal(sources.findIngestionJob("tenant-volga", "ingest-failing")?.errorCode, "knowledge_ingestion_failed");
  });
});
