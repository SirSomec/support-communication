import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { ingestKnowledgeDocument } from "./document-ingestion.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";

export interface KnowledgeObjectReader {
  read(input: { fileId: string; objectKey: string; tenantId: string; maxBytes: number }): Promise<Uint8Array>;
}

export interface KnowledgeDocumentExtractor {
  extract(input: { bytes: Uint8Array; fileName: string; mimeType: string }): Promise<string>;
}

export async function processOneKnowledgeDocumentIngestion(input: {
  extractor?: KnowledgeDocumentExtractor;
  maxBytes?: number;
  reader: KnowledgeObjectReader;
  sources?: KnowledgeSourceRepository;
  workspace?: WorkspaceRepository;
}): Promise<{ outcome: "completed" | "empty" | "failed"; jobId?: string }> {
  const sources = input.sources ?? KnowledgeSourceRepository.default(); const workspace = input.workspace ?? WorkspaceRepository.default();
  const job = sources.claimNextIngestionJob(); if (!job) return { outcome: "empty" };
  try {
    const source = sources.find(job.tenantId, job.sourceId); const file = await workspace.findFile(job.fileId, { tenantId: job.tenantId });
    if (!source || source.kind !== "document" || !file || file.storageState !== "uploaded" || file.scanVerdict !== "clean" || !["clean", "scan_clean"].includes(file.scanState)) throw new Error("knowledge_attachment_scan_required");
    const bytes = await input.reader.read({ fileId: file.fileId, maxBytes: input.maxBytes ?? 1_000_000, objectKey: file.objectKey, tenantId: job.tenantId });
    if (bytes.byteLength > (input.maxBytes ?? 1_000_000)) throw new Error("knowledge_document_too_large");
    const text = await (input.extractor ?? plainTextExtractor).extract({ bytes, fileName: file.fileName, mimeType: file.mimeType });
    const prepared = ingestKnowledgeDocument(text); if (!prepared) throw new Error("knowledge_document_text_required");
    const now = new Date().toISOString();
    sources.save({ ...source, approvalStatus: "pending", approvedAt: null, approvedBy: null, contentChecksum: prepared.checksum, failedAt: null, failureCode: null, lastIndexedAt: now, lastIngestedAt: now, metadata: { ...source.metadata, attachmentFileId: file.fileId, chunks: prepared.chunks, extraction: "object_storage_worker", ingestionJobId: job.jobId, language: prepared.language }, status: "ready", updatedAt: now, version: source.version + 1 });
    sources.completeIngestionJob(job.jobId, "completed"); return { outcome: "completed", jobId: job.jobId };
  } catch (error) {
    const code = error instanceof Error ? error.message : "knowledge_ingestion_failed";
    const source = sources.find(job.tenantId, job.sourceId);
    if (source) sources.save({ ...source, failedAt: new Date().toISOString(), failureCode: code, status: "failed", updatedAt: new Date().toISOString(), version: source.version + 1 });
    sources.completeIngestionJob(job.jobId, "failed", code); return { outcome: "failed", jobId: job.jobId };
  }
}

const plainTextExtractor: KnowledgeDocumentExtractor = {
  async extract({ bytes, mimeType }): Promise<string> {
    if (!["text/plain", "text/markdown", "text/html"].includes(mimeType.toLowerCase())) throw new Error("knowledge_document_mime_unsupported");
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return mimeType.toLowerCase() === "text/html" ? text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ") : text;
  }
};
