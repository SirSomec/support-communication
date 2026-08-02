import { type BackendEnvelope } from "@support-communication/envelope";
import { QueueDirectoryRepository } from "./queue-directory.repository.js";
export interface QueueDirectoryContext {
    tenantId?: string;
}
export interface QueueDirectoryPayload {
    defaultTeamId?: string | null;
    id?: string;
    memberIds?: string[];
    name?: string;
    queueId?: string;
    status?: string;
}
export declare class QueueDirectoryService {
    private readonly repository;
    constructor(repository?: QueueDirectoryRepository);
    fetchQueues(filters?: {
        status?: string;
    }, context?: QueueDirectoryContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createQueue(payload?: QueueDirectoryPayload, context?: QueueDirectoryContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateQueue(queueId: string | undefined, payload?: QueueDirectoryPayload, context?: QueueDirectoryContext): Promise<BackendEnvelope<Record<string, unknown>>>;
}
