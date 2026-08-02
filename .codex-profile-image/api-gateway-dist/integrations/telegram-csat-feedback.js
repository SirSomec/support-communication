import { writeStructuredLog } from "@support-communication/observability";
import { CSAT_FEEDBACK_ACK_TEXT, CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT, CSAT_FEEDBACK_NEW_APPEAL_CALLBACK, CSAT_FEEDBACK_NEW_APPEAL_TEXT, CSAT_FEEDBACK_PROMPT_TEXT, conversationCsatFeedback, csatFeedbackConversationMutation, isAwaitingCsatFeedback, withCsatFeedback } from "../quality/csat-feedback.js";
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
// После записанной оценки: скрыть сообщение опроса (где Telegram это
// позволяет — deleteMessage), предложить комментарий и пометить закрытое
// обращение как ожидающее отзыв.
export async function offerTelegramCsatFeedbackAfterRating(input) {
    const conversation = input.conversation;
    if (conversation.status !== "closed") {
        return { offered: false };
    }
    // Повторное нажатие кнопки оценки (ретрай вебхука, смена балла) не должно
    // спамить клиента повторными промптами: активное ожидание лишь обновляет
    // привязку к последней оценке.
    const current = conversationCsatFeedback(conversation);
    const alreadyAwaiting = isAwaitingCsatFeedback(conversation);
    const updated = withCsatFeedback(conversation, {
        offeredAt: alreadyAwaiting && current ? current.offeredAt : new Date().toISOString(),
        ratingId: input.ratingId,
        state: "awaiting"
    });
    await input.conversationRepository.saveConversationMutation(csatFeedbackConversationMutation(updated, "quality.feedback.offered", { ratingId: input.ratingId }));
    if (alreadyAwaiting) {
        return { offered: false };
    }
    if (input.surveyMessageId) {
        await callTelegramApi(input.api, "deleteMessage", {
            chat_id: input.chatId,
            message_id: input.surveyMessageId
        }, conversation.id);
    }
    await callTelegramApi(input.api, "sendMessage", {
        chat_id: input.chatId,
        reply_markup: JSON.stringify({
            inline_keyboard: [[{ callback_data: CSAT_FEEDBACK_NEW_APPEAL_CALLBACK, text: CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT }]]
        }),
        text: CSAT_FEEDBACK_PROMPT_TEXT
    }, conversation.id);
    return { offered: true };
}
// Кнопка «Новое обращение»: клиент не хочет оставлять отзыв — снимаем
// ожидание (следующее сообщение снова откроет обращение) и прячем промпт.
export async function declineTelegramCsatFeedback(input) {
    const conversation = input.conversation;
    let declined = false;
    if (isAwaitingCsatFeedback(conversation)) {
        const current = conversationCsatFeedback(conversation);
        const updated = withCsatFeedback(conversation, {
            offeredAt: current?.offeredAt ?? new Date().toISOString(),
            ratingId: current?.ratingId ?? "",
            state: "declined"
        });
        await input.conversationRepository.saveConversationMutation(csatFeedbackConversationMutation(updated, "quality.feedback.declined", { ratingId: current?.ratingId ?? null }));
        declined = true;
    }
    if (input.promptMessageId) {
        await callTelegramApi(input.api, "deleteMessage", {
            chat_id: input.chatId,
            message_id: input.promptMessageId
        }, conversation.id);
    }
    if (input.callbackQueryId) {
        await callTelegramApi(input.api, "answerCallbackQuery", {
            callback_query_id: input.callbackQueryId
        }, conversation.id);
    }
    if (declined) {
        await callTelegramApi(input.api, "sendMessage", {
            chat_id: input.chatId,
            text: CSAT_FEEDBACK_NEW_APPEAL_TEXT
        }, conversation.id);
    }
    return { declined };
}
// Подтверждение принятого отзыва в чате клиента.
export async function acknowledgeTelegramCsatFeedback(input) {
    await callTelegramApi(input.api, "sendMessage", {
        chat_id: input.chatId,
        text: CSAT_FEEDBACK_ACK_TEXT
    }, input.conversationId);
}
async function callTelegramApi(api, method, params, conversationId) {
    const token = String(api.botToken ?? "").trim();
    const fetcher = api.fetcher ?? globalThis.fetch;
    if (!token || !fetcher) {
        return false;
    }
    const endpoint = new URL(`${String(api.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "")}/bot${token}/${method}`);
    for (const [key, value] of Object.entries(params)) {
        endpoint.searchParams.set(key, value);
    }
    try {
        const response = await fetcher(endpoint.toString(), {});
        if (!response.ok) {
            throw new Error(`telegram_csat_feedback_api_failed:${response.status}`);
        }
        return true;
    }
    catch (error) {
        writeStructuredLog("warn", "Telegram CSAT feedback side call failed", {
            conversationId,
            error: error instanceof Error ? error.message : String(error),
            method,
            operation: "telegram.csat_feedback.api",
            service: "integration-service"
        });
        return false;
    }
}
//# sourceMappingURL=telegram-csat-feedback.js.map