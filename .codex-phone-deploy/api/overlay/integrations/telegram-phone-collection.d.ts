import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";
export interface TelegramPhoneCollectionApi {
    apiBaseUrl?: string;
    botToken?: string;
    fetcher?: TelegramHttpFetch;
}
type ConversationStore = Pick<ConversationRepository, "saveConversationMutation">;
export declare function requestTelegramPhoneIfMissing(input: {
    api: TelegramPhoneCollectionApi;
    chatId: string;
    conversation: ConversationRecord;
    conversationRepository: ConversationStore;
}): Promise<{
    conversation: ConversationRecord;
    requested: boolean;
}>;
export declare function acknowledgeTelegramPhoneShare(input: {
    api: TelegramPhoneCollectionApi;
    chatId: string;
    conversationId: string;
}): Promise<void>;
export {};
