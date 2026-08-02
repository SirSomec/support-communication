/**
 * The source-catalog contract shared by ingestion, retrieval and scenario
 * binding.  No transport or persistence implementation belongs here: source
 * handling starts in BAI-401 and must keep every operation tenant scoped.
 */
export declare const knowledgeSourceKinds: readonly ["document", "url", "mcp"];
export type KnowledgeSourceKind = typeof knowledgeSourceKinds[number];
export declare const knowledgeSourceStatuses: readonly ["draft", "uploaded", "fetching", "indexing", "ready", "failed", "disabled", "archived"];
export type KnowledgeSourceStatus = typeof knowledgeSourceStatuses[number];
export declare const knowledgeSourceReadinesses: readonly ["not_ready", "ready", "stale"];
export type KnowledgeSourceReadiness = typeof knowledgeSourceReadinesses[number];
export declare const knowledgeSourceApprovalStatuses: readonly ["pending", "approved", "rejected"];
export type KnowledgeSourceApprovalStatus = typeof knowledgeSourceApprovalStatuses[number];
export interface KnowledgeSourceRecord {
    approvalStatus: KnowledgeSourceApprovalStatus;
    approvedAt: string | null;
    approvedBy: string | null;
    archivedAt: string | null;
    contentChecksum: string | null;
    createdAt: string;
    disabledAt: string | null;
    failedAt: string | null;
    failureCode: string | null;
    id: string;
    kind: KnowledgeSourceKind;
    lastIndexedAt: string | null;
    lastIngestedAt: string | null;
    metadata: Record<string, unknown>;
    owner: string;
    readiness: KnowledgeSourceReadiness;
    retentionUntil: string | null;
    sourceConfig: Record<string, unknown>;
    sourceRef: string | null;
    status: KnowledgeSourceStatus;
    tenantId: string;
    title: string;
    updatedAt: string;
    version: number;
}
export declare function canTransitionKnowledgeSourceStatus(from: KnowledgeSourceStatus, to: KnowledgeSourceStatus): boolean;
/**
 * Решение 2026-07-17: логика одобрения выведена из эксплуатации — привязанный
 * источник используется ботом безусловно, как только контент проиндексирован.
 * Поле approvalStatus осталось в модели ради совместимости данных и всегда
 * ставится "approved" при создании/обновлении.
 */
export declare function deriveKnowledgeSourceReadiness(status: KnowledgeSourceStatus, _approvalStatus: KnowledgeSourceApprovalStatus): KnowledgeSourceReadiness;
export declare function isKnowledgeSourceRetrievalEligible(source: Pick<KnowledgeSourceRecord, "approvalStatus" | "readiness" | "status">): boolean;
