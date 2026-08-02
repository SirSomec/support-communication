import type { BotScenario } from "./automation.types.js";
import type { ConversationOutboundDescriptor, ConversationOutboundDescriptorRecord, ConversationRepository, RealtimeEvent } from "../conversation/conversation.repository.js";
export interface BotRuntimeStateTransitionInput {
    channel?: string;
    conversationId: string;
    currentNodeId: string;
    eventId: string;
    scenario: BotScenario;
    tenantId: string;
    traceId: string;
}
export interface BotRuntimeNodeSelectionInput extends BotRuntimeStateTransitionInput {
    edgeLabel?: string;
}
export declare function planBotRuntimeLabeledTransition(input: BotRuntimeNodeSelectionInput): BotRuntimeStateTransition;
export interface BotRuntimeStateTransition {
    conversationId: string;
    eventId: string;
    nextNodeId: string;
    nodeType: string;
    previousNodeId: string;
    scenarioId: string;
    sideEffects: BotRuntimeSideEffect[];
    status: "transitioned";
    tenantId: string;
    traceId: string;
}
/**
 * Consultation mode: the dialog stays on the same `ai_reply` node for the next
 * client message instead of moving along an edge. Exit conditions (client asks
 * for a human, turn limit, AI failure) are decided by node execution, not here.
 */
export declare function planBotRuntimeConsultationStay(input: BotRuntimeStateTransitionInput): BotRuntimeStateTransition;
export interface BotRuntimeConversationState {
    conversationId: string;
    currentNodeId: string;
    lastEventId: string;
    previousNodeId?: string;
    scenarioId: string;
    tenantId: string;
    traceId?: string;
    updatedAt: string;
}
export interface BotRuntimeOutboundMessageSideEffect {
    descriptor: ConversationOutboundDescriptor;
    kind: "message_delivery";
}
export interface BotRuntimeHandoffDescriptor {
    eventId: string;
    eventName: "bot.handoff.created";
    resourceId: string;
    resourceType: "conversation";
    schemaVersion: "bot-handoff/v1";
    summary: {
        botId: string;
        nodeId: string;
        queue: string;
        reason: string;
    };
    tenantId: string;
    traceId: string;
}
export interface BotRuntimeHandoffSideEffect {
    descriptor: BotRuntimeHandoffDescriptor;
    kind: "bot_handoff";
}
export interface BotRuntimeCloseDescriptor {
    eventId: string;
    eventName: "bot.resolution.completed";
    resourceId: string;
    resourceType: "conversation";
    schemaVersion: "bot-resolution/v1";
    summary: {
        botId: string;
        nodeId: string;
        reason: string;
        resolutionOutcome: string;
    };
    tenantId: string;
    traceId: string;
}
export interface BotRuntimeCloseSideEffect {
    descriptor: BotRuntimeCloseDescriptor;
    kind: "conversation_close";
}
export type BotRuntimeSideEffect = BotRuntimeOutboundMessageSideEffect | BotRuntimeHandoffSideEffect | BotRuntimeCloseSideEffect;
export interface BotRuntimeOutboundPersistenceInput {
    conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
    transition: BotRuntimeStateTransition;
}
export interface BotRuntimeHandoffPersistenceInput {
    conversationRepository: Pick<ConversationRepository, "appendRealtimeEvent" | "listRealtimeEvents">;
    occurredAt?: string;
    transition: BotRuntimeStateTransition;
}
export interface BotRuntimeHandoffPersistenceRecord {
    descriptor: BotRuntimeHandoffDescriptor;
    realtimeEvent: RealtimeEvent;
}
export interface BotRuntimeRetryStateInput {
    currentAttempts?: number;
    error: Error | string;
    failedAt: string;
    retryBackoffMs?: number;
}
export interface BotRuntimeRetryState {
    attempts: number;
    deadLetteredAt: null;
    failedAt: string;
    lastError: string;
    nextAttemptAt: string;
    status: "retry_scheduled";
}
export interface BotRuntimeDeadLetterStateInput {
    currentAttempts?: number;
    error: Error | string;
    failedAt: string;
}
export interface BotRuntimeDeadLetterState {
    attempts: number;
    deadLetteredAt: string;
    failedAt: string;
    lastError: string;
    nextAttemptAt: null;
    status: "dead_lettered";
}
export declare function planBotRuntimeStateTransition(input: BotRuntimeStateTransitionInput): BotRuntimeStateTransition;
export declare function applyBotRuntimeStateTransition(state: BotRuntimeConversationState, transition: BotRuntimeStateTransition, updatedAt?: string): BotRuntimeConversationState;
export declare function persistBotRuntimeOutboundDescriptors(input: BotRuntimeOutboundPersistenceInput): Promise<ConversationOutboundDescriptorRecord[]>;
export declare function persistBotRuntimeHandoffDescriptors(input: BotRuntimeHandoffPersistenceInput): Promise<BotRuntimeHandoffPersistenceRecord[]>;
export declare function resolveBotRuntimeRetryState(input: BotRuntimeRetryStateInput): BotRuntimeRetryState;
export declare function resolveBotRuntimeDeadLetterState(input: BotRuntimeDeadLetterStateInput): BotRuntimeDeadLetterState;
