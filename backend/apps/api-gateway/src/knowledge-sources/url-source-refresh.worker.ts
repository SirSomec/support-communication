import type { KnowledgeSourcesService } from "./knowledge-sources.service.js";

export interface UrlSourceRefreshWorkerResult { failed: number; refreshed: number; }

/** Runs due URL-source refreshes serially so each source keeps its tenant
 * context and SSRF checks. Scheduling is deliberately outside request paths. */
export async function runUrlSourceRefreshOnce(service: Pick<KnowledgeSourcesService, "refreshDueUrls">, now = new Date()): Promise<UrlSourceRefreshWorkerResult> {
  return service.refreshDueUrls(now);
}
