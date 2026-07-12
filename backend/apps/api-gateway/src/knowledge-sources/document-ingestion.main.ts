import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureWorkspaceRepository } from "../workspace/bootstrap.js";
import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { createObjectStorageDocumentReader } from "./object-storage-document-reader.js";
import { processOneKnowledgeDocumentIngestion } from "./document-ingestion.worker.js";

export async function runKnowledgeDocumentIngestionFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const run = async () => processOneKnowledgeDocumentIngestion({ reader: createObjectStorageDocumentReader(), sources: KnowledgeSourceRepository.default(), workspace: configureWorkspaceRepository(source) });
  const first = await run();
  if (argv.includes("--once") || source.KNOWLEDGE_DOCUMENT_INGESTION_ONCE === "true") { console.log(JSON.stringify({ result: first, service: "knowledge-document-ingestion-worker" })); return; }
  const interval = positive(source.KNOWLEDGE_DOCUMENT_INGESTION_INTERVAL_MS, 5_000); let running = false;
  setInterval(() => { if (running) return; running = true; void run().then((result) => writeStructuredLog("info", "Knowledge document ingestion completed", { ...result, service: "knowledge-document-ingestion-worker" })).catch((error) => writeStructuredLog("error", "Knowledge document ingestion failed", { error: error instanceof Error ? error.message : String(error), service: "knowledge-document-ingestion-worker" })).finally(() => { running = false; }); }, interval);
}
function positive(value: string | undefined, fallback: number): number { const parsed = Number(value ?? fallback); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void runKnowledgeDocumentIngestionFromEnv().catch((error) => { console.error(error); process.exitCode = 1; });
