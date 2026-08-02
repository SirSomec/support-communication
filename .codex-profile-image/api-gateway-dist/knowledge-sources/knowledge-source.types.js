/**
 * The source-catalog contract shared by ingestion, retrieval and scenario
 * binding.  No transport or persistence implementation belongs here: source
 * handling starts in BAI-401 and must keep every operation tenant scoped.
 */
export const knowledgeSourceKinds = ["document", "url", "mcp"];
export const knowledgeSourceStatuses = [
    "draft",
    "uploaded",
    "fetching",
    "indexing",
    "ready",
    "failed",
    "disabled",
    "archived"
];
export const knowledgeSourceReadinesses = ["not_ready", "ready", "stale"];
export const knowledgeSourceApprovalStatuses = ["pending", "approved", "rejected"];
const transitions = {
    archived: [],
    disabled: ["draft", "uploaded", "fetching", "indexing", "ready", "archived"],
    draft: ["uploaded", "fetching", "disabled", "archived"],
    failed: ["uploaded", "fetching", "disabled", "archived"],
    fetching: ["uploaded", "indexing", "failed", "disabled", "archived"],
    indexing: ["ready", "failed", "disabled", "archived"],
    ready: ["fetching", "indexing", "disabled", "archived"],
    uploaded: ["indexing", "failed", "disabled", "archived"]
};
export function canTransitionKnowledgeSourceStatus(from, to) {
    return from === to || transitions[from].includes(to);
}
/**
 * Решение 2026-07-17: логика одобрения выведена из эксплуатации — привязанный
 * источник используется ботом безусловно, как только контент проиндексирован.
 * Поле approvalStatus осталось в модели ради совместимости данных и всегда
 * ставится "approved" при создании/обновлении.
 */
export function deriveKnowledgeSourceReadiness(status, _approvalStatus) {
    return status === "ready" ? "ready" : "not_ready";
}
export function isKnowledgeSourceRetrievalEligible(source) {
    return source.status === "ready";
}
//# sourceMappingURL=knowledge-source.types.js.map