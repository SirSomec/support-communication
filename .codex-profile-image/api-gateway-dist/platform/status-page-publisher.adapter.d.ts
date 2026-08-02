import type { CustomerVisibleIncidentCommunicationPlan, IncidentCommunicationSyncJob } from "../incidents/incident-communication.worker.js";
import type { PlatformOutboxRow } from "./platform.repository.js";
export type StatusPagePublishScope = "component-alert" | "incident-update";
export interface StatusPagePublishBody {
    componentId?: string;
    componentName?: string;
    customerMessage?: string;
    incidentId?: string;
    public: boolean;
    reason?: string | null;
    severity?: string;
    status: string;
    tenantNamesExposed: false;
    updateText?: string;
}
export interface StatusPagePublishRequest {
    body: StatusPagePublishBody;
    externalIdempotencyKey: string;
    scope: StatusPagePublishScope;
    target: string;
    traceId: string;
}
export interface StatusPagePublishResult {
    externalId: string;
    externalIdempotencyKey: string;
    ok: boolean;
    providerStatusCode?: number;
    publishedAt: string;
    sanitizedFailure?: string;
}
export interface StatusPagePublisherPort {
    publish(request: StatusPagePublishRequest): Promise<StatusPagePublishResult>;
}
export interface PublishIncidentStatusPageCommunicationInput {
    job: IncidentCommunicationSyncJob;
    now?: string;
    plan: CustomerVisibleIncidentCommunicationPlan;
    publisher: StatusPagePublisherPort;
    traceId?: string;
}
export interface PublishPlatformAlertStatusPageCommunicationInput {
    component: {
        id: string;
        name: string;
        status: string;
    };
    now?: string;
    publisher: StatusPagePublisherPort;
    reason?: string | null;
    statusPageSync: {
        id: string;
        queue: string;
        scope: string;
        target: string;
    };
    traceId: string;
}
export interface ExecuteStatusPageSyncOutboxWorkerInput {
    now?: string;
    outbox: PlatformOutboxRow;
    publisher: StatusPagePublisherPort;
    repository: {
        updatePlatformOutboxRowStatusAsync(idempotencyKey: string, status: string, payloadPatch?: Record<string, unknown>): Promise<PlatformOutboxRow>;
    };
}
export interface ExecuteStatusPageSyncOutboxWorkerResult {
    outbox: PlatformOutboxRow;
    publishResult: StatusPagePublishResult;
    status: "published" | "retry_scheduled";
}
export interface DeterministicStatusPagePublisherAdapterOptions {
    responses?: Map<string, StatusPagePublishResult>;
}
export interface RuntimeHttpStatusPagePublisherAdapterOptions {
    apiKey?: string;
    endpoint: string;
    fetch?: typeof fetch;
}
export declare function buildStatusPageExternalIdempotencyKey(scope: StatusPagePublishScope, target: string): string;
export declare function sanitizeStatusPagePublisherFailure(error: unknown): string;
export declare function createDeterministicStatusPagePublisherAdapter(options?: DeterministicStatusPagePublisherAdapterOptions): StatusPagePublisherPort;
export declare function createRuntimeHttpStatusPagePublisherAdapter(options: RuntimeHttpStatusPagePublisherAdapterOptions): StatusPagePublisherPort;
export declare function publishIncidentStatusPageCommunication(input: PublishIncidentStatusPageCommunicationInput): Promise<StatusPagePublishResult>;
export declare function publishPlatformAlertStatusPageCommunication(input: PublishPlatformAlertStatusPageCommunicationInput): Promise<StatusPagePublishResult>;
export declare function executeStatusPageSyncOutboxWorker(input: ExecuteStatusPageSyncOutboxWorkerInput): Promise<ExecuteStatusPageSyncOutboxWorkerResult>;
