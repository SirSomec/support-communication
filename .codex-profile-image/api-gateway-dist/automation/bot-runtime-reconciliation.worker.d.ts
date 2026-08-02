import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { RealtimeFanoutAdapter } from "../conversation/realtime.fanout.js";
import type { AutomationRepository } from "./automation.repository.js";
export interface BotRuntimeReconciliationWorkerInput {
    automationRepository: AutomationRepository;
    /**
     * Штатное закрытие обращения (ConversationService.transitionConversationStatus):
     * история обращения, resolutionOutcome, журнал, realtime и CSAT-опрос —
     * воркер не дублирует эту логику, а вызывает сервис через колбэк.
     */
    closeConversation?: (payload: {
        conversationId: string;
        reason: string;
        resolutionOutcome: string;
        topic?: string;
    }, scope: {
        tenantId: string;
    }) => Promise<{
        error?: {
            code?: string;
        } | null;
        status: string;
    }>;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "findOutboundDescriptorByIdempotencyKey" | "listLifecycleEvents" | "queueOutboundMessageReply" | "recordOutboundDescriptor" | "saveConversationMutation">;
    leaseMs?: number;
    limit?: number;
    maxAttempts?: number;
    now?: string;
    realtimeFanout?: Pick<RealtimeFanoutAdapter, "publish">;
    resolveQueueId?: (tenantId: string, queueReference: string) => Promise<string | undefined>;
    retryBackoffMs?: number;
}
export interface BotRuntimeReconciliationResult {
    claimed: number;
    deadLettered: number;
    delivered: number;
    failed: number;
    scanned: number;
    skipped: number;
}
export declare function runBotRuntimeReconciliationOnce(input: BotRuntimeReconciliationWorkerInput): Promise<BotRuntimeReconciliationResult>;
