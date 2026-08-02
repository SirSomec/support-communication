import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";
/**
 * Доступ к Telegram Bot API для сервисных сообщений CSAT-флоу. Все вызовы
 * best-effort: провайдерская ошибка не должна откатывать запись оценки или
 * отзыва — без токена (legacy-вебхук) сетевые эффекты просто пропускаются.
 */
export interface TelegramCsatApiAccess {
    apiBaseUrl?: string;
    botToken?: string;
    fetcher?: TelegramHttpFetch;
}
type CsatConversationStore = Pick<ConversationRepository, "saveConversationMutation">;
export declare function offerTelegramCsatFeedbackAfterRating(input: {
    api: TelegramCsatApiAccess;
    chatId: string;
    conversation: ConversationRecord;
    conversationRepository: CsatConversationStore;
    ratingId: string;
    surveyMessageId?: string;
}): Promise<{
    offered: boolean;
}>;
export declare function declineTelegramCsatFeedback(input: {
    api: TelegramCsatApiAccess;
    callbackQueryId?: string;
    chatId: string;
    conversation: ConversationRecord;
    conversationRepository: CsatConversationStore;
    promptMessageId?: string;
}): Promise<{
    declined: boolean;
}>;
export declare function acknowledgeTelegramCsatFeedback(input: {
    api: TelegramCsatApiAccess;
    chatId: string;
    conversationId: string;
}): Promise<void>;
export {};
