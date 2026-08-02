import type { ConversationRepository } from "./conversation.repository.js";
export interface RealtimeRetentionWorkerOptions {
    intervalMs?: number;
    now?: () => Date;
    repository: Pick<ConversationRepository, "pruneRealtimeEvents">;
    retentionMs?: number;
}
export interface RealtimeRetentionWorkerHandle {
    stop(): void;
}
export declare function runRealtimeRetentionOnce(options: RealtimeRetentionWorkerOptions): Promise<{
    before: string;
    removed: number;
}>;
export declare function startRealtimeRetentionWorker(options: RealtimeRetentionWorkerOptions): RealtimeRetentionWorkerHandle;
