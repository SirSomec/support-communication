import { type BackendEnvelope } from "@support-communication/envelope";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { type ChannelConnectionAuditEventRecord } from "../integrations/integration.repository.js";
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
export declare class WorkspaceAuditService {
    private readonly sources;
    constructor(sources?: WorkspaceAuditSources);
    fetchWorkspaceAuditEvents(filters?: WorkspaceAuditFilters, context?: WorkspaceAuditContext): Promise<BackendEnvelope<Record<string, unknown>>>;
}
