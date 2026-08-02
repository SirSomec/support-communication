import { type BackendEnvelope } from "@support-communication/envelope";
import { TopicDirectoryRepository } from "./topic-directory.repository.js";
interface TopicMutationPayload {
    accessScope?: string;
    archived?: boolean;
    branchName?: string;
    channels?: string[];
    groupName?: string;
    name?: string;
    required?: boolean;
    routingTarget?: string;
    sortOrder?: number;
}
export declare class TopicDirectoryService {
    private readonly repository;
    constructor(repository?: TopicDirectoryRepository);
    fetchTopics(filters: {
        query?: string;
        status?: string;
    }, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    createTopic(payload: TopicMutationPayload, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateTopic(topicId: string, payload: TopicMutationPayload, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    archiveTopic(topicId: string, payload: {
        reason?: string;
    }, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    restoreTopic(topicId: string, payload: {
        reason?: string;
    }, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTopicUsage(topicId: string, scope: {
        tenantId: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    private setArchiveState;
}
export {};
