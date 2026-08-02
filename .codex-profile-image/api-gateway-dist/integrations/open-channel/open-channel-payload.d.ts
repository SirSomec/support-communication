import type { ConversationRecord } from "../../conversation/conversation.types.js";
import type { OpenChannelConversationStateRecord } from "./open-channel.repository.js";
/**
 * Builders for the event-webhook payload format shared by popular live-chat
 * platforms. Field names and value types follow that de-facto convention so
 * consumers migrating from third-party products keep their parsers unchanged.
 */
export interface CompatVisitor {
    chats_count: number;
    description: string;
    email?: string;
    name?: string;
    number: string;
    phone?: string;
    social: Record<string, unknown>;
}
export interface CompatAgent {
    email: string;
    id: string;
    name: string;
    phone?: string;
}
/** Deterministic positive 31-bit id — consumers expect numeric chat_id / visitor numbers. */
export declare function stableNumericId(value: string): number;
export declare function externalClientId(conversation: ConversationRecord, state?: OpenChannelConversationStateRecord): string;
export declare function visitorFromConversation(conversation: ConversationRecord, state?: OpenChannelConversationStateRecord): CompatVisitor;
export declare function agentFromConversation(conversation: ConversationRecord): CompatAgent | null;
export declare function pageFromConversation(conversation: ConversationRecord): {
    title?: string;
    url: string;
} | null;
export declare function sessionStub(): Record<string, unknown>;
export interface CompatWebhookEventBase {
    agent?: CompatAgent | null;
    assigned_agent: null;
    chat_id: number;
    event_name: string;
    organization: null;
    page: {
        title?: string;
        url: string;
    } | null;
    session: Record<string, unknown>;
    status: null;
    tags: Array<{
        id: string;
        title: string;
    }>;
    user_token: string | null;
    visitor: CompatVisitor;
    widget_id: string;
}
export declare function compatWebhookEventBase(eventName: string, conversation: ConversationRecord, state: OpenChannelConversationStateRecord | undefined, widgetId: string): CompatWebhookEventBase;
export declare function chatMessagesFromConversation(conversation: ConversationRecord): Array<Record<string, unknown>>;
export declare function plainMessagesFromConversation(conversation: ConversationRecord): string;
