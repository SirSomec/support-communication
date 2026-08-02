import { createEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { IntegrationRepository } from "../integrations/integration.repository.js";
const AUDIT_SERVICE = "workspaceAuditService";
const DEFAULT_LIMIT = 300;
export class WorkspaceAuditService {
    sources;
    constructor(sources = {}) {
        this.sources = sources;
    }
    async fetchWorkspaceAuditEvents(filters = {}, context = {}) {
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
        const [lifecycleResult, channelResult] = await Promise.allSettled([
            Promise.resolve(conversationRepository.listLifecycleEvents({ tenantId })),
            loadChannelAuditEvents(integrationRepository)
        ]);
        const lifecycleEvents = lifecycleResult.status === "fulfilled" ? lifecycleResult.value : [];
        const channelEvents = channelResult.status === "fulfilled" ? channelResult.value : [];
        const sourceHealth = {
            channels: channelResult.status === "fulfilled" ? "available" : "unavailable",
            conversations: lifecycleResult.status === "fulfilled" ? "available" : "unavailable"
        };
        const unavailableSources = Object.entries(sourceHealth)
            .filter(([, status]) => status === "unavailable")
            .map(([source]) => source);
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
            partial: unavailableSources.length > 0,
            meta: { apiVersion: "v1", source: "api", sourceHealth, tenantId, unavailableSources },
            data: {
                items,
                page: {
                    limit,
                    returnedRows: items.length,
                    totalRows: allItems.length
                },
                sourceHealth,
                unavailableSources
            }
        });
    }
}
async function loadChannelAuditEvents(repository) {
    if (repository.listChannelConnectionAuditEventsAsync) {
        return repository.listChannelConnectionAuditEventsAsync();
    }
    return repository.listChannelConnectionAuditEvents();
}
function lifecycleAuditItem(event) {
    const data = event.data && typeof event.data === "object" ? { ...event.data } : {};
    const score = Number(data.score);
    const lowQualityScore = event.eventType.startsWith("quality.assessment") && Number.isFinite(score) && score < 4;
    const severity = event.eventType === "sla.overdue" || lowQualityScore || event.reason === "repeat_appeal" || /dead_letter/i.test(event.eventType)
        ? "warning"
        : "info";
    const source = event.eventType.startsWith("quality.")
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
function channelAuditItem(event) {
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
function auditPeriodCutoff(period) {
    const normalized = String(period ?? "30d").trim().toLowerCase();
    const durations = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
        "365d": 365 * 24 * 60 * 60 * 1000
    };
    const duration = durations[normalized] ?? durations["30d"];
    return Date.now() - duration;
}
function normalizeAuditLimit(limit) {
    const normalized = Number(limit ?? DEFAULT_LIMIT);
    if (!Number.isInteger(normalized) || normalized <= 0) {
        return DEFAULT_LIMIT;
    }
    return Math.min(normalized, 1000);
}
//# sourceMappingURL=workspace-audit.service.js.map