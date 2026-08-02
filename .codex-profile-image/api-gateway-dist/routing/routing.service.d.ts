import { type BackendEnvelope } from "@support-communication/envelope";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { OperatorPresenceRepository } from "../presence/operator-presence.repository.js";
import { CanonicalRoutingConversationRepository } from "./canonical-routing-conversation.repository.js";
import { CanonicalRoutingWorkloadAdapter } from "./canonical-routing-workload.adapter.js";
import { RoutingRepository } from "./routing.repository.js";
interface WorkloadFilters {
    channel?: string;
}
interface AssignmentPayload {
    action?: string;
    conversationId: string;
    overrideLimit?: boolean;
    reason?: string;
    targetOperatorId?: string;
}
interface AssignmentSimulationPayload {
    conversationId: string;
}
interface RedistributionPayload {
    idempotencyKey?: string;
    previewId?: string;
    reason?: string;
    selectedQueues?: string[];
    targetRule?: string;
}
interface SlaPausePayload {
    conversationId: string;
    durationMinutes?: number | string;
    reason?: string;
}
interface RescueStartPayload {
    conversationId: string;
    durationSeconds?: number;
    reason?: string;
    source?: string;
}
interface RescueResolvePayload {
    conversationId: string;
    outcome?: string;
    reason?: string;
}
interface RescueReportFilters {
    period?: string;
}
export interface RoutingRequestContext {
    actorId?: string;
    actorName?: string;
    actorType?: "operator" | "service_admin";
    tenantId?: string;
}
export declare class RoutingService {
    private readonly routingRepository;
    private readonly canonicalWorkload?;
    private readonly canonicalConversations?;
    private readonly canonicalTeams?;
    private readonly operatorPresence;
    private conversations;
    private operationTail;
    private operators;
    private queues;
    private rescueReportRows;
    constructor(routingRepository?: RoutingRepository, canonicalWorkload?: CanonicalRoutingWorkloadAdapter | undefined, canonicalConversations?: CanonicalRoutingConversationRepository | undefined, canonicalTeams?: TeamDirectoryRepository | undefined, operatorPresence?: Pick<OperatorPresenceRepository, "findCurrent" | "listCurrent">);
    fetchWorkload(filters?: WorkloadFilters, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private fetchWorkloadUnlocked;
    createAssignment(payload: AssignmentPayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private createAssignmentUnlocked;
    simulateAssignment(payload: AssignmentSimulationPayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private simulateAssignmentUnlocked;
    autoAssignConversation(conversationId: string, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private autoAssignConversationUnlocked;
    previewRedistribution(payload: RedistributionPayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private previewRedistributionUnlocked;
    commitRedistribution(payload: RedistributionPayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private commitRedistributionUnlocked;
    pauseSla(payload: SlaPausePayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private pauseSlaUnlocked;
    startRescue(payload: RescueStartPayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private startRescueUnlocked;
    resolveRescue(payload: RescueResolvePayload, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private resolveRescueUnlocked;
    fetchRescueReport(filters?: RescueReportFilters, context?: RoutingRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private fetchRescueReportUnlocked;
    private normalizeRedistributionPayload;
    private buildRedistributionPlan;
    private buildAssignmentCandidates;
    /**
     * Время последнего назначения (assignment/transfer) по операторам из
     * routing analytics. Нужно для ротации: при полностью равной загрузке
     * диалог получает оператор, дольше всех не получавший обращений, — иначе
     * при низком потоке все обращения уходили бы первому по списку.
     */
    private readLastAssignedAtByOperator;
    private returnConversationToQueue;
    private moveOperatorAssignment;
    private moveOperatorRescueActive;
    private moveQueueWaitingToActive;
    private filterQueues;
    private findConversation;
    private findConversationForTenant;
    private findOperator;
    private findOperatorForTenant;
    private findQueueForTenant;
    private moveQueueActiveToWaiting;
    private listActiveQueueMemberships;
    private listOperatorCapacities;
    private operatorHasChannelAccess;
    private operatorCanAccessChannel;
    private resolveRoutingPolicy;
    private listOperatorPresence;
    private findOperatorPresence;
    private operatorBelongsToTenant;
    private conversationBelongsToTenant;
    private queueBelongsToTenant;
    private rescueReportRowBelongsToTenant;
    private withRoutingState;
    private persistState;
    private hydrateCanonicalRoutingState;
    private persistManualTransition;
    private persistBatchTransition;
}
export {};
