import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { ingestKnowledgeDocument } from "./document-ingestion.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";

const KNOWLEDGE_INGESTION_FAILURE_CODES = new Set([
  "knowledge_attachment_scan_required",
  "knowledge_document_extract_failed",
  "knowledge_document_mime_unsupported",
  "knowledge_document_text_required",
  "knowledge_document_too_large"
]);

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
  const job = await sources.claimNextIngestionJob(); if (!job) return { outcome: "empty" };
  try {
    const source = await sources.find(job.tenantId, job.sourceId); const file = await workspace.findFile(job.fileId, { tenantId: job.tenantId });
    if (!source || source.kind !== "document" || !file || file.storageState !== "uploaded" || file.scanVerdict !== "clean" || !["clean", "scan_clean"].includes(file.scanState)) throw new Error("knowledge_attachment_scan_required");
    const bytes = await input.reader.read({ fileId: file.fileId, maxBytes: input.maxBytes ?? 1_000_000, objectKey: file.objectKey, tenantId: job.tenantId });
    if (bytes.byteLength > (input.maxBytes ?? 1_000_000)) throw new Error("knowledge_document_too_large");
    const text = await (input.extractor ?? plainTextExtractor).extract({ bytes, fileName: file.fileName, mimeType: file.mimeType });
    const prepared = ingestKnowledgeDocument(text); if (!prepared) throw new Error("knowledge_document_text_required");
    const now = new Date().toISOString();
    await sources.save({ ...source, approvalStatus: "approved", approvedAt: source.approvedAt ?? now, approvedBy: source.approvedBy ?? "auto", contentChecksum: prepared.checksum, failedAt: null, failureCode: null, lastIndexedAt: now, lastIngestedAt: now, metadata: { ...source.metadata, attachmentFileId: file.fileId, chunks: prepared.chunks, extraction: "object_storage_worker", ingestionJobId: job.jobId, language: prepared.language }, status: "ready", updatedAt: now, version: source.version + 1 });
    await sources.completeIngestionJob(job.jobId, "completed"); return { outcome: "completed", jobId: job.jobId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    const code = KNOWLEDGE_INGESTION_FAILURE_CODES.has(errorMessage)
      ? errorMessage
      : "knowledge_ingestion_failed";
    const source = await sources.find(job.tenantId, job.sourceId);
    if (source) await sources.save({ ...source, failedAt: new Date().toISOString(), failureCode: code, status: "failed", updatedAt: new Date().toISOString(), version: source.version + 1 });
    await sources.completeIngestionJob(job.jobId, "failed", code); return { outcome: "failed", jobId: job.jobId };
  }
}

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const execFile = promisify(execFileCallback);

const plainTextExtractor: KnowledgeDocumentExtractor = {
  async extract(input): Promise<string> { return extractKnowledgeDocumentText(input); }
};

export async function extractKnowledgeDocumentText(
  input: { bytes: Uint8Array; fileName: string; mimeType: string },
  options: { runCommand?: (command: string, args: string[]) => Promise<string> } = {}
): Promise<string> {
  const mimeType = input.mimeType.toLowerCase();
  if (["text/plain", "text/markdown"].includes(mimeType)) return new TextDecoder("utf-8", { fatal: false }).decode(input.bytes);
  if (mimeType === "text/html") return stripMarkup(new TextDecoder("utf-8", { fatal: false }).decode(input.bytes));
  if (mimeType === "application/pdf") return extractWithCommand(input.bytes, ".pdf", "pdftotext", ["-enc", "UTF-8", "-nopgbrk", "{file}", "-"], options.runCommand);
  if (mimeType === DOCX_MIME_TYPE) {
    const xml = await extractWithCommand(input.bytes, ".docx", "unzip", ["-p", "{file}", "word/document.xml"], options.runCommand);
    return decodeWordDocumentXml(xml);
  }
  throw new Error("knowledge_document_mime_unsupported");
}

async function extractWithCommand(bytes: Uint8Array, extension: string, command: string, args: string[], runCommand?: (command: string, args: string[]) => Promise<string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "support-knowledge-"));
  const filePath = join(directory, `document${extension}`);
  try {
    await writeFile(filePath, bytes);
    const output = await (runCommand ?? runExtractionCommand)(command, args.map((arg) => arg === "{file}" ? filePath : arg));
    return output;
  } catch {
    throw new Error("knowledge_document_extract_failed");
  } finally {
    await rm(directory, { force: true, recursive: true }).catch(() => undefined);
  }
}

async function runExtractionCommand(command: string, args: string[]): Promise<string> {
  const result = await execFile(command, args, { encoding: "utf8", maxBuffer: 1_000_000, timeout: 10_000 });
  return result.stdout;
}

function stripMarkup(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ");
}

function decodeWordDocumentXml(value: string): string {
  return decodeXmlEntities(value
    .replace(/<w:tab\b[^>]*\/>/gi, " ")
    .replace(/<w:br\b[^>]*\/>|<\/w:p>/gi, "\n")
    .replace(/<[^>]*>/g, " "));
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|apos|gt|lt|quot);/g, (_match, entity: string) => ({ amp: "&", apos: "'", gt: ">", lt: "<", quot: "\"" })[entity] ?? " ");
}
