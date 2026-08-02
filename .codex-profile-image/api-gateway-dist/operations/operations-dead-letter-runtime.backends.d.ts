import type { DeadLetterReplayBackendItem, DeadLetterReplayBackendStore } from "./dead-letter-replay.worker.js";
interface ReplayEnvelope {
    data: Record<string, any>;
    error?: {
        code?: string;
    } | null;
    status: string;
}
interface ReportReplayBackendOptions {
    findExportJob?: (id: string) => Promise<Record<string, any> | undefined>;
    retryExport?: (id: string, tenantId: string, reason: string) => Promise<ReplayEnvelope>;
}
interface WebhookReplayBackendOptions {
    findDelivery?: (id: string) => Promise<Record<string, any> | undefined>;
    replayDelivery?: (id: string, idempotencyKey: string) => Promise<ReplayEnvelope>;
}
export declare function createReportExportDeadLetterReplayBackendStore(options?: ReportReplayBackendOptions): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
export declare function createWebhookDeliveryDeadLetterReplayBackendStore(options?: WebhookReplayBackendOptions): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
export {};
