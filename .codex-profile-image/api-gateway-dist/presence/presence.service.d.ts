import { type BackendEnvelope } from "@support-communication/envelope";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { type RealtimeFanoutAdapter } from "../conversation/realtime.fanout.js";
import { type IdentityRepositoryPort } from "../identity/identity.repository.js";
import { type OperatorPresenceRepositoryPort } from "./operator-presence.repository.js";
export declare const OPERATOR_PRESENCE_UPDATED_EVENT = "operator.presence.updated";
export interface PresenceRequestContext {
    actorId?: string;
    actorName?: string;
    actorType?: "operator" | "service_admin";
    tenantId?: string;
}
export interface PresenceServiceOptions {
    /**
     * Drains queued dialogs after an operator becomes available. Routing remains
     * responsible for candidate selection and capacity checks.
     */
    autoAssignQueuedConversations?: (tenantId: string) => Promise<void>;
    conversationRepository?: Pick<ConversationRepository, "appendRealtimeEvent">;
    identityRepository?: Pick<IdentityRepositoryPort, "findTenantUsers">;
    presenceRepository?: OperatorPresenceRepositoryPort;
    realtimeFanout?: RealtimeFanoutAdapter;
}
export declare class OperatorPresenceService {
    private readonly autoAssignQueuedConversations?;
    private readonly conversationRepository;
    private readonly identityRepository;
    private readonly presenceRepository;
    private readonly realtimeFanout;
    constructor(options?: PresenceServiceOptions);
    static configureRealtimeFanoutFromEnv(source?: NodeJS.ProcessEnv): void;
    fetchMyPresence(context?: PresenceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    setMyPresence(payload: {
        status?: string;
    }, context?: PresenceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    /**
     * Used when an operator leaves the workplace. This is deliberately a
     * compare-and-set: a stale browser tab must not overwrite a status the
     * operator selected later in another tab or device.
     */
    markMyPresenceUnavailableIfOnline(context?: PresenceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTeamPresence(filters?: {
        from?: string;
        to?: string;
    }, context?: PresenceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private resolveOperatorName;
    private publishPresenceUpdate;
}
