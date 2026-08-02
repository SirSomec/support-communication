import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { TopicDirectoryService } from "./topic-directory.service.js";
export declare class TopicsController {
    private readonly topicDirectoryService;
    constructor(topicDirectoryService: TopicDirectoryService);
    fetchTopics(query: {
        query?: string;
        status?: string;
    }, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createTopic(payload: Record<string, unknown>, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateTopic(topicId: string, payload: Record<string, unknown>, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    archiveTopic(topicId: string, payload: {
        reason?: string;
    } | undefined, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    restoreTopic(topicId: string, payload: {
        reason?: string;
    } | undefined, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchTopicUsage(topicId: string, request: TopicDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
type TopicDirectoryRequest = TenantOperatorRequest & ServiceAdminRequest;
export {};
