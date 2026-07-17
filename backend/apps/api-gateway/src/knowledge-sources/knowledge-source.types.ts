/**
 * The source-catalog contract shared by ingestion, retrieval and scenario
 * binding.  No transport or persistence implementation belongs here: source
 * handling starts in BAI-401 and must keep every operation tenant scoped.
 */
export const knowledgeSourceKinds = ["document", "url", "mcp"] as const;
export type KnowledgeSourceKind = typeof knowledgeSourceKinds[number];

export const knowledgeSourceStatuses = [
  "draft",
  "uploaded",
  "fetching",
  "indexing",
  "ready",
  "failed",
  "disabled",
  "archived"
] as const;
export type KnowledgeSourceStatus = typeof knowledgeSourceStatuses[number];

export const knowledgeSourceReadinesses = ["not_ready", "ready", "stale"] as const;
export type KnowledgeSourceReadiness = typeof knowledgeSourceReadinesses[number];

export const knowledgeSourceApprovalStatuses = ["pending", "approved", "rejected"] as const;
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

const transitions: Readonly<Record<KnowledgeSourceStatus, readonly KnowledgeSourceStatus[]>> = {
  archived: [],
  disabled: ["draft", "uploaded", "fetching", "indexing", "ready", "archived"],
  draft: ["uploaded", "fetching", "disabled", "archived"],
  failed: ["uploaded", "fetching", "disabled", "archived"],
  fetching: ["uploaded", "indexing", "failed", "disabled", "archived"],
  indexing: ["ready", "failed", "disabled", "archived"],
  ready: ["fetching", "indexing", "disabled", "archived"],
  uploaded: ["indexing", "failed", "disabled", "archived"]
};

export function canTransitionKnowledgeSourceStatus(
  from: KnowledgeSourceStatus,
  to: KnowledgeSourceStatus
): boolean {
  return from === to || transitions[from].includes(to);
}

/**
 * Решение 2026-07-17: логика одобрения выведена из эксплуатации — привязанный
 * источник используется ботом безусловно, как только контент проиндексирован.
 * Поле approvalStatus осталось в модели ради совместимости данных и всегда
 * ставится "approved" при создании/обновлении.
 */
export function deriveKnowledgeSourceReadiness(
  status: KnowledgeSourceStatus,
  _approvalStatus: KnowledgeSourceApprovalStatus
): KnowledgeSourceReadiness {
  return status === "ready" ? "ready" : "not_ready";
}

export function isKnowledgeSourceRetrievalEligible(source: Pick<KnowledgeSourceRecord, "approvalStatus" | "readiness" | "status">): boolean {
  return source.status === "ready";
}
