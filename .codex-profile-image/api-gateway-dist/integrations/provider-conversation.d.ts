import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
export interface ProviderConversationInput {
    channel: "MAX" | "VK";
    channelConnectionId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    displayName: string;
    phone?: string;
    providerConversationId: string;
    providerUserId?: string;
    interceptCsatFeedback?: boolean;
    queueId?: string;
    tenantId: string;
}
export interface ResolvedProviderConversation {
    conversation: ConversationRecord;
    csatFeedbackAwaiting: boolean;
}
export declare function resolveOrCreateProviderConversation(input: ProviderConversationInput): Promise<ResolvedProviderConversation | null>;
export declare function providerConversationKey(tenantId: string, connectionId: string, providerConversationId: string): string;
