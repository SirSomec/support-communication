import type { ConversationLifecycleEvent, ConversationRepository, RealtimeEvent } from "./conversation.repository.js";
import type { ConversationRecord } from "./conversation.types.js";
export declare const APPEAL_ANCHOR_TAG_PREFIX = "appeal-anchor:";
export declare const REPEAT_APPEAL_TAG = "repeat-appeal";
export declare const REPEAT_APPEAL_WINDOW_MS: number;
export interface AppealLifecycleMetadata {
    anchorId?: string;
    closedAt?: string;
    isRepeatAppeal?: boolean;
    parentConversationId?: string;
}
export interface AppealConversationMutation {
    conversation: ConversationRecord;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
}
export interface ResolveAppealConversationInput {
    anchorId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    createInitial: () => ConversationRecord;
    createMutation: (conversation: ConversationRecord, eventType?: "conversation.created" | "conversation.updated") => AppealConversationMutation;
    /**
     * Живой адрес доставки из входящего события провайдера (tg chat id,
     * externalId и т.п.). Обязателен для fork-ветки: у закрытого appeal binding
     * уже снят releaseProviderBindingForClosedAppeal, наследовать нечего — без
     * этого поля новый тред падал в legacy-фолбэк на телефон и Telegram отвечал
     * 400 на каждую доставку (инцидент 2026-07-17).
     */
    providerConversationId?: string;
    /**
     * Перехват CSAT-отзыва: если последнее обращение закрыто и ждет комментарий
     * к оценке, входящее сообщение принадлежит ему (как отзыв), а не новому
     * обращению — fork не выполняется, а результат помечается флагом.
     */
    interceptCsatFeedback?: boolean;
    tenantId: string;
}
export interface ResolveAppealConversationResult {
    conversation: ConversationRecord;
    csatFeedbackAwaiting?: boolean;
    forked: boolean;
    isRepeatAppeal?: boolean;
}
export declare function appealAnchorTag(anchorId: string): string;
export declare function conversationMetadata(conversation: ConversationRecord): AppealLifecycleMetadata;
export declare function withConversationMetadata(conversation: ConversationRecord, patch: AppealLifecycleMetadata): ConversationRecord;
export declare function ensureAppealAnchorTag(conversation: ConversationRecord, anchorId: string): ConversationRecord;
export declare function resolveClosedAt(conversation: ConversationRecord): Date | undefined;
export declare function detectRepeatAppeal(closedConversation: ConversationRecord): boolean;
export declare function recordClosedAppealHistory(conversation: ConversationRecord, closedAt: string): ConversationRecord;
export declare function buildFollowUpAppeal(closedConversation: ConversationRecord, anchorId: string, providerConversationId?: string): ConversationRecord;
export declare function releaseProviderBindingForClosedAppeal(conversation: ConversationRecord): ConversationRecord;
export declare function resolveOrForkAppealConversation(input: ResolveAppealConversationInput): Promise<ResolveAppealConversationResult | null>;
