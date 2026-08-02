import { ConversationRepository } from "../conversation/conversation.repository.js";
import { type IdentityRepositoryPort } from "../identity/identity.repository.js";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { QueueDirectoryRepository } from "./queue-directory.repository.js";
import type { RoutingOperator, RoutingQueue } from "./routing.types.js";
export interface CanonicalRoutingOperator extends RoutingOperator {
    availability: {
        online: null;
        source: "not_recorded";
    };
    metricSources: {
        avgFirstResponseSeconds: "not_recorded";
        chats: "canonical_conversations";
        limit: "identity_user_metadata" | "not_recorded";
        rescueActive: "not_recorded";
        slaPercent: "canonical_conversations";
    };
    queueIds: string[];
    status: "offline";
}
export interface CanonicalRoutingQueue extends RoutingQueue {
    /** Canonical SupportQueue.id. The legacy channel key carries the same queue id. */
    queueId: string;
    memberIds: string[];
    metricSources: {
        active: "canonical_conversations";
        health: "canonical_conversations";
        limit: "not_recorded";
        overdue: "canonical_conversations";
        waiting: "canonical_conversations";
    };
    name: string;
    transportChannels: string[];
}
export interface CanonicalRoutingWorkload {
    operators: CanonicalRoutingOperator[];
    queues: CanonicalRoutingQueue[];
    tenantId: string;
}
export interface CanonicalRoutingWorkloadDependencies {
    conversationRepository: Pick<ConversationRepository, "listConversations">;
    identityRepository: Pick<IdentityRepositoryPort, "findTenantUsers">;
    queueDirectoryRepository: Pick<QueueDirectoryRepository, "listQueues">;
    teamDirectoryRepository: Pick<TeamDirectoryRepository, "listTeams">;
}
export declare class CanonicalRoutingWorkloadAdapter {
    private readonly dependencies;
    constructor(dependencies?: Partial<CanonicalRoutingWorkloadDependencies>);
    readWorkload(tenantId: string): Promise<CanonicalRoutingWorkload>;
}
