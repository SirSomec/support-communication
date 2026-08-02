/** Runs due URL-source refreshes serially so each source keeps its tenant
 * context and SSRF checks. Scheduling is deliberately outside request paths. */
export async function runUrlSourceRefreshOnce(service, now = new Date()) {
    return service.refreshDueUrls(now);
}
//# sourceMappingURL=url-source-refresh.worker.js.map