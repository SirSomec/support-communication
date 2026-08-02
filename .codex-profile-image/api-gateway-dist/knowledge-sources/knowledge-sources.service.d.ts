import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { type KnowledgeSourceKind } from "./knowledge-source.types.js";
import { UrlSourcePolicyRepository } from "./url-source-policy.repository.js";
import { AutomationRepository } from "../automation/automation.repository.js";
export declare const knowledgeSourceBulkActions: readonly ["archive", "delete", "disable", "enable"];
export type KnowledgeSourceBulkAction = typeof knowledgeSourceBulkActions[number];
export interface KnowledgeSourceCreateInput {
    kind?: KnowledgeSourceKind;
    sourceConfig?: Record<string, unknown>;
    sourceRef?: string;
    title?: string;
}
export interface UrlSourceTransportResult {
    connectedPeerAddress?: string;
    response: Response;
}
export type UrlSourceTransport = (url: string, init: RequestInit) => Promise<Response | UrlSourceTransportResult>;
export interface UrlSourcePolicyWriteInput {
    allowedHosts?: string[] | null;
}
export declare class KnowledgeSourcesService {
    private readonly repository;
    private readonly workspaceRepository;
    private readonly options;
    private readonly policyRepository;
    private readonly identityRepository;
    private readonly automationRepository;
    constructor(repository?: KnowledgeSourceRepository, workspaceRepository?: WorkspaceRepository, options?: {
        fetch?: UrlSourceTransport;
        resolveHostname?: (hostname: string) => Promise<Array<{
            address: string;
        }>>;
    }, policyRepository?: UrlSourcePolicyRepository, identityRepository?: IdentityRepository, automationRepository?: AutomationRepository);
    list(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    /** BAI-822: где используется каждый источник — по обычным привязкам и черновикам сценариев. */
    private scenarioUsage;
    /**
     * Отвязать источник от всех сценариев (обычные привязки и черновики).
     * Удаление/архивация документа не должны блокироваться привязкой к боту —
     * вместо тупика «сначала отвяжите» просто убираем источник из знаний бота.
     * Возвращает имена затронутых сценариев для сообщения оператору.
     */
    private unbindSourceEverywhere;
    update(tenantId: string, sourceId: string, input: {
        title?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    enable(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    archive(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    remove(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    /** BAI-825: «что именно знает бот» — проиндексированные фрагменты без выдачи целого документа. */
    preview(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    create(tenantId: string, input: KnowledgeSourceCreateInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    disable(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    refreshUrl(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    /**
     * Массовые операции над источниками (после пакетной загрузки): каждый источник
     * проходит те же проверки, что и одиночное действие; уже находящиеся в целевом
     * состоянии и невозможные переходы попадают в skipped с кодом причины.
     */
    applyBulk(tenantId: string, action: KnowledgeSourceBulkAction, input: {
        sourceIds?: unknown;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    private applyBulkOne;
    getUrlPolicy(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    setUrlPolicy(tenantId: string, input: UrlSourcePolicyWriteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    refreshDueUrls(now?: Date): Promise<{
        failed: number;
        refreshed: number;
    }>;
    /** Rebuild article chunks only from its current published and approved version. */
    refreshDocument(tenantId: string, sourceId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    private recordUrlAudit;
    enqueueAttachmentIngestion(tenantId: string, sourceId: string, input: {
        fileId?: string;
        idempotencyKey?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
}
export declare function assertPublicResolution(hostname: string, resolver?: (hostname: string) => Promise<Array<{
    address: string;
}>>): Promise<void>;
