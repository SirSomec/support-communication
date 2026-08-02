import type { KnowledgeSourcesService } from "./knowledge-sources.service.js";
export interface UrlSourceRefreshWorkerResult {
    failed: number;
    refreshed: number;
}
/** Runs due URL-source refreshes serially so each source keeps its tenant
 * context and SSRF checks. Scheduling is deliberately outside request paths. */
export declare function runUrlSourceRefreshOnce(service: Pick<KnowledgeSourcesService, "refreshDueUrls">, now?: Date): Promise<UrlSourceRefreshWorkerResult>;
