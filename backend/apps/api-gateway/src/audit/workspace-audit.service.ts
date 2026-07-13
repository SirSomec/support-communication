import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { ConversationRepository, type ConversationLifecycleEvent } from "../conversation/conversation.repository.js";
import { IntegrationRepository, type ChannelConnectionAuditEventRecord } from "../integrations/integration.repository.js";

const AUDIT_SERVICE = "workspaceAuditService";
const DEFAULT_LIMIT = 300;

export interface WorkspaceAuditContext {
  actorId?: string;
  tenantId?: string;
}

export interface WorkspaceAuditFilters {
  limit?: number | string;
  period?: string;
}

export interface WorkspaceAuditSources {
  conversationRepository?: Pick<ConversationRepository, "listLifecycleEvents">;
  integrationRepository?: {
    listChannelConnectionAuditEvents(): ChannelConnectionAuditEventRecord[];
    listChannelConnectionAuditEventsAsync?(): Promise<ChannelConnectionAuditEventRecord[]>;
  };
}

export interface WorkspaceAuditItem {
  action: string;
  actorId: string | null;
  actorName: string | null;
  actorType: string;
  at: string;
  data: Record<string, unknown>;
  id: string;
  immutable: true;
  objectType: "Диалог" | "Канал";
  reason: string | null;
  result: string;
  severity: "info" | "warning" | "critical";
  source: "Диалоги" | "Качество" | "Боты" | "Каналы";
  target: string;
  tenantId: string;
  traceId: string;
  userId: string | null;
}

export class WorkspaceAuditService {
  constructor(private readonly sources: WorkspaceAuditSources = {}) {}

  async fetchWorkspaceAuditEvents(
    filters: WorkspaceAuditFilters = {},
    context: WorkspaceAuditContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    const traceId = getCurrentTraceId() ?? createRequestTraceId(AUDIT_SERVICE, "fetchWorkspaceAuditEvents");
    if (!tenantId) {
      return createEnvelope({
        service: AUDIT_SERVICE,
        operation: "fetchWorkspaceAuditEvents",
        traceId,
        status: "invalid",
        meta: { apiVersion: "v1", source: "api" },
        data: {},
        error: { code: "tenant_context_required", message: "Tenant context is required for workspace audit." }
      });
    }

    const conversationRepository = this.sources.conversationRepository ?? ConversationRepository.default();
    const integrationRepository = this.sources.integrationRepository ?? IntegrationRepository.default();
    const [lifecycleEvents, channelEvents] = await Promise.all([
      Promise.resolve(conversationRepository.listLifecycleEvents({ tenantId })).catch(() => [] as ConversationLifecycleEvent[]),
      loadChannelAuditEvents(integrationRepository).catch(() => [] as ChannelConnectionAuditEventRecord[])
    ]);

    const cutoff = auditPeriodCutoff(filters.period);
    const allItems = [
      ...lifecycleEvents.map(lifecycleAuditItem),
      ...channelEvents.filter((event) => event.tenantId === tenantId).map(channelAuditItem)
    ]
      .filter((item) => cutoff === null || Date.parse(item.at) >= cutoff)
      .sort((left, right) => Date.parse(right.at) - Date.parse(left.at));
    const limit = normalizeAuditLimit(filters.limit);
    const items = allItems.slice(0, limit);

    return createEnvelope({
      service: AUDIT_SERVICE,
      operation: "fetchWorkspaceAuditEvents",
      traceId,
      partial: true,
      meta: { apiVersion: "v1", source: "api", tenantId },
      data: {
        items,
        page: {
          limit,
          returnedRows: items.length,
          totalRows: allItems.length
        }
      }
    });
  }
}

async function loadChannelAuditEvents(
  repository: NonNullable<WorkspaceAuditSources["integrationRepository"]>
): Promise<ChannelConnectionAuditEventRecord[]> {
  if (repository.listChannelConnectionAuditEventsAsync) {
    return repository.listChannelConnectionAuditEventsAsync();
  }
  return repository.listChannelConnectionAuditEvents();
}

function lifecycleAuditItem(event: ConversationLifecycleEvent): WorkspaceAuditItem {
  const data = event.data && typeof event.data === "object" ? { ...event.data } : {};
  const score = Number((data as Record<string, unknown>).score);
  const lowQualityScore = event.eventType.startsWith("quality.assessment") && Number.isFinite(score) && score < 4;
  const severity: WorkspaceAuditItem["severity"] =
    event.eventType === "sla.overdue" || lowQualityScore || event.reason === "repeat_appeal" || /dead_letter/i.test(event.eventType)
      ? "warning"
      : "info";
  const source: WorkspaceAuditItem["source"] = event.eventType.startsWith("quality.")
    ? "Качество"
    : event.actorType === "worker" || /bot/i.test(event.eventType) || /bot/i.test(String(event.source ?? ""))
      ? "Боты"
      : "Диалоги";

  return {
    action: event.eventType,
    actorId: event.actorId ?? null,
    actorName: event.actorName ?? null,
    actorType: event.actorType,
    at: event.occurredAt,
    data,
    id: event.id,
    immutable: true,
    objectType: "Диалог",
    reason: event.reason ?? null,
    result: "applied",
    severity,
    source,
    target: event.conversationId,
    tenantId: event.tenantId,
    traceId: event.traceId,
    userId: event.actorType === "operator" ? event.actorId ?? null : null
  };
}

function channelAuditItem(event: ChannelConnectionAuditEventRecord): WorkspaceAuditItem {
  return {
    action: event.action,
    actorId: null,
    actorName: null,
    actorType: "system",
    at: event.at,
    data: { connectionType: event.type },
    id: event.id,
    immutable: true,
    objectType: "Канал",
    reason: event.reason || null,
    result: event.result,
    severity: /fail|error|denied|invalid|expired/i.test(event.result) ? "critical" : "info",
    source: "Каналы",
    target: event.connectionId,
    tenantId: event.tenantId,
    traceId: "",
    userId: null
  };
}

function auditPeriodCutoff(period: string | undefined): number | null {
  const normalized = String(period ?? "30d").trim().toLowerCase();
  const durations: Record<string, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "365d": 365 * 24 * 60 * 60 * 1000
  };
  const duration = durations[normalized];
  return duration ? Date.now() - duration : null;
}

function normalizeAuditLimit(limit: number | string | undefined): number {
  const normalized = Number(limit ?? DEFAULT_LIMIT);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(normalized, 1000);
}
