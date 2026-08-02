import { ConversationRepository, type ConversationLifecycleEvent, type RealtimeEvent } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { RoutingConversation } from "./routing.types.js";
export type CanonicalRoutingMutationAction = "assign" | "transfer" | "return_queue";
export interface CanonicalRoutingConversation extends RoutingConversation {
    /** Canonical support queue id. Routing's legacy `channel` field carries this same value. */
    queueId: string;
    persistedStatus: string;
    /** Transport channel from ConversationRecord (for example telegram or sdk). */
    sourceChannel: string;
    updatedAt?: string;
}
export interface CanonicalRoutingMutationInput {
    action: CanonicalRoutingMutationAction;
    actorId?: string;
    actorName?: string;
    actorType?: ConversationLifecycleEvent["actorType"];
    conversationId: string;
    mutationId?: string;
    occurredAt?: string;
    operatorId?: string;
    operatorName?: string;
    queueId?: string;
    reason?: string;
    tenantId: string;
    traceId?: string;
}
export interface CanonicalRoutingMutationResult {
    conversation: CanonicalRoutingConversation;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
    record: ConversationRecord;
}
/**
 * Bridges assignment mutations to the canonical conversation store.
 *
 * SLA and rescue are intentionally deferred: ConversationRecord has no rescue
 * snapshot, and those transitions must also coordinate timer/job ownership.
 */
export declare class CanonicalRoutingConversationRepository {
    private readonly conversationRepository;
    constructor(conversationRepository?: ConversationRepository);
    listConversations(tenantId: string): Promise<CanonicalRoutingConversation[]>;
    findConversation(conversationId: string, tenantId: string): Promise<CanonicalRoutingConversation | undefined>;
    saveRoutingMutation(input: CanonicalRoutingMutationInput): Promise<CanonicalRoutingMutationResult>;
    applyMutation(input: CanonicalRoutingMutationInput): Promise<CanonicalRoutingMutationResult>;
}
export declare class CanonicalRoutingConversationNotFoundError extends Error {
    readonly code = "canonical_routing_conversation_not_found";
    constructor(conversationId: string, tenantId: string);
}
export declare function mapConversationRecordToRoutingConversation(record: ConversationRecord): CanonicalRoutingConversation;
